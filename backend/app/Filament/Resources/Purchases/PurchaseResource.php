<?php

namespace App\Filament\Resources\Purchases;

use App\Documents\TransactionDocuments;
use App\Enums\PurchaseKind;
use App\Filament\Concerns\ReadOnlyResource;
use App\Filament\Resources\Purchases\Pages\ListPurchases;
use App\Filament\Resources\Purchases\Pages\ViewPurchase;
use App\Models\Purchase;
use App\Models\User;
use BackedEnum;
use Carbon\CarbonImmutable;
use Filament\Actions\ViewAction;
use Filament\Infolists\Components\RepeatableEntry;
use Filament\Infolists\Components\RepeatableEntry\TableColumn;
use Filament\Infolists\Components\TextEntry;
use Filament\Resources\Resource;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\Filter;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Filters\TrashedFilter;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\SoftDeletingScope;
use UnitEnum;

/**
 * Phiếu mua / bán của điểm thu mua, lái con (kể cả phiếu đã xóa, có lịch sử sửa). Chỉ xem; mở chi tiết thì ghi nhật ký.
 */
class PurchaseResource extends Resource
{
    use ReadOnlyResource;

    protected static ?string $model = Purchase::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedDocumentText;

    protected static string|UnitEnum|null $navigationGroup = 'Giao dịch người dùng';

    protected static ?int $navigationSort = 3;

    protected static ?string $modelLabel = 'phiếu mua / bán';

    protected static ?string $pluralModelLabel = 'Phiếu mua / bán';

    public static function getEloquentQuery(): Builder
    {
        return parent::getEloquentQuery()
            ->withoutGlobalScopes([SoftDeletingScope::class])
            ->with(['user', 'business'])
            ->withCount('viewers');
    }

    public static function table(Table $table): Table
    {
        $vnd = fn ($state): string => TransactionDocuments::vnd((int) $state);

        return $table
            ->defaultSort('created_at', 'desc')
            ->columns([
                TextColumn::make('code')->label('Số phiếu')->state(fn (Purchase $p): string => $p->code()),
                TextColumn::make('date')->label('Ngày')->date('d/m/Y')->sortable(),
                TextColumn::make('user.name')->label('Người lập')->searchable(),
                TextColumn::make('business.name')->label('Doanh nghiệp')->placeholder('—')->toggleable(),
                TextColumn::make('customer_name')->label('Khách')->searchable(),
                TextColumn::make('kind')->label('Loại')->formatStateUsing(fn (PurchaseKind $state): string => $state->label())->badge(),
                TextColumn::make('amount')->label('Tiền hàng')->formatStateUsing($vnd)->sortable(),
                TextColumn::make('paid')->label('Đã trả')->formatStateUsing($vnd),
                TextColumn::make('owing')->label('Còn nợ')->state(fn (Purchase $p): string => $vnd($p->owing())),
                TextColumn::make('version')->label('Bản')->badge()->color(fn (int $state): string => $state > 1 ? 'warning' : 'gray'),
                TextColumn::make('viewers_count')->label('Khách xem')->numeric(),
                IconColumn::make('deleted_at')->label('Đã xóa')->state(fn (Purchase $p): bool => $p->trashed())->boolean(),
            ])
            ->filters([
                SelectFilter::make('business_id')->label('Doanh nghiệp')->relationship('business', 'name'),
                SelectFilter::make('user_id')->label('Người lập')->relationship('user', 'name')->searchable(),
                Filter::make('edited_after_share')->label('Sửa sau khi gửi khách')->query(fn (Builder $q) => $q->whereNotNull('shared_version')->whereColumn('version', '>', 'shared_version')),
                TrashedFilter::make()->label('Phiếu đã xóa'),
            ])
            ->recordActions([ViewAction::make()]);
    }

    public static function infolist(Schema $schema): Schema
    {
        $vnd = fn ($state): string => TransactionDocuments::vnd((int) $state);
        $kg = fn ($state): string => TransactionDocuments::kg((float) $state);

        return $schema->columns(1)->components([
            Section::make('Phiếu')->columns(4)->schema([
                TextEntry::make('p_code')->label('Số phiếu')->state(fn (Purchase $p): string => $p->code().' · '.$p->kind->label()),
                TextEntry::make('date')->label('Ngày')->date('d/m/Y'),
                TextEntry::make('user.name')->label('Người lập'),
                TextEntry::make('business.name')->label('Doanh nghiệp')->placeholder('—'),
                TextEntry::make('p_customer')->label('Khách')->state(fn (Purchase $p): string => trim($p->customer_name.' '.($p->customer_phone ?? ''))),
                TextEntry::make('amount')->label('Tiền hàng')->formatStateUsing($vnd),
                TextEntry::make('paid')->label('Đã trả')->formatStateUsing($vnd),
                TextEntry::make('p_owing')->label('Còn nợ')->state(fn (Purchase $p): string => $vnd($p->owing())),
                TextEntry::make('note')->label('Ghi chú')->placeholder('—')->columnSpan(2),
                TextEntry::make('deleted_at')->label('Người lập đã xóa lúc')->dateTime('d/m/Y H:i')->placeholder('—'),
                TextEntry::make('p_viewers')->label('Khách được xem')->state(fn (Purchase $p): string => $p->viewers->map(fn (User $u): string => $u->name.($u->pivot->via === 'phone' ? ' (gửi vào app)' : ' (nhập mã)'))->join(', ') ?: '—'),
            ]),
            Section::make('Dòng hàng')->schema([
                RepeatableEntry::make('lines')->hiddenLabel()->placeholder('Không có')
                    ->table([TableColumn::make('Hàng'), TableColumn::make('Cân (kg)'), TableColumn::make('Trừ bì (kg)'), TableColumn::make('Tịnh (kg)'), TableColumn::make('Đơn giá'), TableColumn::make('Thành tiền')])
                    ->schema([
                        TextEntry::make('name'),
                        TextEntry::make('kg')->formatStateUsing($kg),
                        TextEntry::make('deduct_kg')->formatStateUsing($kg),
                        TextEntry::make('net_kg')->formatStateUsing($kg),
                        TextEntry::make('price')->formatStateUsing($vnd),
                        TextEntry::make('amount')->formatStateUsing($vnd),
                    ]),
            ]),
            Section::make('Lịch sử sửa phiếu')->schema([
                RepeatableEntry::make('versions_history')->hiddenLabel()
                    ->placeholder('Không có')
                    ->state(fn (Purchase $p): array => array_map(fn (array $h): array => [
                        'version' => 'Bản '.$h['version'].($h['version'] === $p->shared_version ? ' (gửi khách)' : ''),
                        'at' => $h['at'] ? CarbonImmutable::parse($h['at'])->setTimezone(config('app.timezone'))->format('d/m/Y H:i') : '',
                        'changes' => $h['changes'] ? implode('; ', $h['changes']) : 'Tổng '.TransactionDocuments::vnd($h['amount']).', đã trả '.TransactionDocuments::vnd($h['paid']),
                    ], $p->history()))
                    ->table([TableColumn::make('Bản'), TableColumn::make('Lúc'), TableColumn::make('Thay đổi')])
                    ->schema([TextEntry::make('version'), TextEntry::make('at'), TextEntry::make('changes')]),
            ]),
        ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ListPurchases::route('/'),
            'view' => ViewPurchase::route('/{record}'),
        ];
    }
}
