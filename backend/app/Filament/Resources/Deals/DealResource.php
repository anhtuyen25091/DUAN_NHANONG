<?php

namespace App\Filament\Resources\Deals;

use App\Deals\DealSummary;
use App\Documents\TransactionDocuments;
use App\Enums\DealEntryKind;
use App\Enums\DealEntryStatus;
use App\Enums\DealStatus;
use App\Filament\Concerns\ReadOnlyResource;
use App\Filament\Resources\Deals\Pages\ListDeals;
use App\Filament\Resources\Deals\Pages\ViewDeal;
use App\Models\Deal;
use App\Models\DealEntry;
use BackedEnum;
use Filament\Actions\ViewAction;
use Filament\Infolists\Components\RepeatableEntry;
use Filament\Infolists\Components\RepeatableEntry\TableColumn;
use Filament\Infolists\Components\TextEntry;
use Filament\Resources\Resource;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\Filter;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use UnitEnum;

/**
 * Đơn mua bán chung 2 bên (cọc, đợt cân, trả tiền, xác nhận / báo sai). Chỉ xem; mở chi tiết thì ghi nhật ký.
 */
class DealResource extends Resource
{
    use ReadOnlyResource;

    protected static ?string $model = Deal::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedHandRaised;

    protected static string|UnitEnum|null $navigationGroup = 'Giao dịch người dùng';

    protected static ?int $navigationSort = 2;

    protected static ?string $modelLabel = 'đơn mua bán';

    protected static ?string $pluralModelLabel = 'Đơn mua bán';

    protected static ?string $recordTitleAttribute = 'title';

    public static function getEloquentQuery(): Builder
    {
        return parent::getEloquentQuery()
            ->with(['seller', 'buyer', 'business', 'entries'])
            ->withCount(['entries as disputed_count' => fn (Builder $q) => $q->where('status', DealEntryStatus::Disputed)]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('updated_at', 'desc')
            ->columns([
                TextColumn::make('code')->label('Mã')->searchable(),
                TextColumn::make('title')->label('Tên đơn')->searchable()->wrap(),
                TextColumn::make('seller_label')->label('Bên bán')->state(fn (Deal $d): string => $d->seller?->name ?? ($d->seller_name ? $d->seller_name.' (chưa tham gia)' : '—')),
                TextColumn::make('buyer_label')->label('Bên mua')->state(fn (Deal $d): string => $d->buyer?->name ?? ($d->buyer_name ? $d->buyer_name.' (chưa tham gia)' : '—')),
                TextColumn::make('status')->label('Trạng thái')->formatStateUsing(fn (DealStatus $state): string => self::statusLabel($state))->badge(),
                TextColumn::make('business.name')->label('Doanh nghiệp')->placeholder('—')->toggleable(),
                TextColumn::make('delivered')->label('Tiền hàng đã xác nhận')
                    ->state(fn (Deal $d): string => TransactionDocuments::vnd(DealSummary::totals($d->entries->where('status', DealEntryStatus::Confirmed)->filter(fn (DealEntry $e): bool => $e->kind->isShared()))['delivered'])),
                TextColumn::make('disputed_count')->label('Báo sai')->badge()->color(fn (int $state): string => $state > 0 ? 'danger' : 'gray'),
                TextColumn::make('updated_at')->label('Cập nhật')->dateTime('d/m/Y H:i')->sortable(),
            ])
            ->filters([
                SelectFilter::make('status')->label('Trạng thái')->options(collect(DealStatus::cases())->mapWithKeys(fn (DealStatus $s): array => [$s->value => self::statusLabel($s)])->all()),
                Filter::make('disputed')->label('Có mục báo sai')->query(fn (Builder $q) => $q->whereHas('entries', fn (Builder $e) => $e->where('status', DealEntryStatus::Disputed))),
                SelectFilter::make('business_id')->label('Doanh nghiệp')->relationship('business', 'name'),
            ])
            ->recordActions([ViewAction::make()]);
    }

    public static function infolist(Schema $schema): Schema
    {
        $vnd = fn ($state): string => TransactionDocuments::vnd((int) $state);
        $totals = fn (Deal $d): array => DealSummary::totals($d->entries->filter(fn (DealEntry $e): bool => $e->kind->isShared() && $e->status !== DealEntryStatus::Disputed));

        return $schema->columns(1)->components([
            Section::make('Đơn')->columns(4)->schema([
                TextEntry::make('code')->label('Mã'),
                TextEntry::make('status')->label('Trạng thái')->formatStateUsing(fn (DealStatus $state): string => self::statusLabel($state))->badge(),
                TextEntry::make('seller_info')->label('Bên bán')->state(fn (Deal $d): string => trim(($d->seller?->name ?? $d->seller_name ?? '—').' '.($d->seller?->phone ?? ''))),
                TextEntry::make('buyer_info')->label('Bên mua')->state(fn (Deal $d): string => trim(($d->buyer?->name ?? $d->buyer_name ?? '—').' '.($d->buyer?->phone ?? ''))),
                TextEntry::make('business.name')->label('Doanh nghiệp')->placeholder('—'),
                TextEntry::make('created_at')->label('Tạo lúc')->dateTime('d/m/Y H:i'),
                TextEntry::make('last_activity')->label('Việc mới nhất')->placeholder('—')->columnSpan(2),
            ]),
            Section::make('Số liệu (đã xác nhận + chờ xác nhận, bỏ mục báo sai)')->columns(4)->schema([
                TextEntry::make('t_delivered')->label('Tiền hàng')->state(fn (Deal $d): string => $vnd($totals($d)['delivered']).' ('.TransactionDocuments::kg($totals($d)['kg']).' kg)'),
                TextEntry::make('t_deposit')->label('Cọc · đã trừ')->state(fn (Deal $d): string => $vnd($totals($d)['deposit']).' · '.$vnd($totals($d)['deducted'])),
                TextEntry::make('t_paid')->label('Đã trả')->state(fn (Deal $d): string => $vnd($totals($d)['paid'])),
                TextEntry::make('t_balance')->label('Bên mua còn phải trả')->state(fn (Deal $d): string => $vnd($totals($d)['balance'])),
            ]),
            Section::make('Các mục')->schema([
                RepeatableEntry::make('entry_rows')->hiddenLabel()
                    ->placeholder('Không có')
                    ->state(fn (Deal $d): array => $d->entries->load('creator')->sortBy(fn (DealEntry $e): string => $e->date->toDateString().'|'.$e->id)->map(fn (DealEntry $e): array => [
                        'date' => TransactionDocuments::date($e->date),
                        'kind' => match ($e->kind) {
                            DealEntryKind::Cut => 'Đợt cân',
                            DealEntryKind::Deposit => 'Cọc',
                            DealEntryKind::Payment => 'Trả tiền',
                            DealEntryKind::Cost => 'Chi phí riêng',
                        },
                        'detail' => $e->kind === DealEntryKind::Cut ? implode('; ', array_map(fn (array $l): string => ($l['grade'] ?? '').': '.TransactionDocuments::kg((float) ($l['kg'] ?? 0)).' kg × '.TransactionDocuments::money((int) ($l['price'] ?? 0)), $e->lines ?? [])) : '',
                        'amount' => $e->amount,
                        'deduct' => $e->deposit_deduct,
                        'paid' => $e->paid,
                        'status' => match ($e->status) {
                            DealEntryStatus::Pending => 'Chờ xác nhận',
                            DealEntryStatus::Confirmed => 'Đã xác nhận',
                            DealEntryStatus::Disputed => 'Báo sai: '.($e->dispute_reason ?? ''),
                            DealEntryStatus::Private => 'Riêng',
                        },
                        'by' => $e->creator?->name ?? '',
                    ])->values()->all())
                    ->table([TableColumn::make('Ngày'), TableColumn::make('Loại'), TableColumn::make('Chi tiết'), TableColumn::make('Tiền'), TableColumn::make('Trừ cọc'), TableColumn::make('Trả ngay'), TableColumn::make('Trạng thái'), TableColumn::make('Ai ghi')])
                    ->schema([
                        TextEntry::make('date'),
                        TextEntry::make('kind'),
                        TextEntry::make('detail')->placeholder('—'),
                        TextEntry::make('amount')->formatStateUsing($vnd),
                        TextEntry::make('deduct')->formatStateUsing($vnd),
                        TextEntry::make('paid')->formatStateUsing($vnd),
                        TextEntry::make('status'),
                        TextEntry::make('by'),
                    ]),
            ]),
        ]);
    }

    public static function statusLabel(DealStatus $status): string
    {
        return match ($status) {
            DealStatus::Open => 'Đang mở',
            DealStatus::Done => 'Đã xong',
            DealStatus::Cancelled => 'Đã hủy',
        };
    }

    public static function getPages(): array
    {
        return [
            'index' => ListDeals::route('/'),
            'view' => ViewDeal::route('/{record}'),
        ];
    }
}
