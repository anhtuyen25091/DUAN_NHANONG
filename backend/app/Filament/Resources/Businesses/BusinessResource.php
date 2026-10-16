<?php

namespace App\Filament\Resources\Businesses;

use App\Businesses\BusinessStats;
use App\Documents\TransactionDocuments;
use App\Filament\Concerns\ReadOnlyResource;
use App\Filament\Resources\Businesses\Pages\ListBusinesses;
use App\Filament\Resources\Businesses\Pages\ViewBusiness;
use App\Models\Business;
use App\Models\BusinessAdvance;
use App\Models\Purchase;
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
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use UnitEnum;

/**
 * Doanh nghiệp thu mua (chủ + lái con): lái, số liệu tháng này từng lái, tiền ứng. Chỉ xem; mở chi tiết thì ghi nhật ký.
 */
class BusinessResource extends Resource
{
    use ReadOnlyResource;

    protected static ?string $model = Business::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedBuildingOffice2;

    protected static string|UnitEnum|null $navigationGroup = 'Giao dịch người dùng';

    protected static ?int $navigationSort = 4;

    protected static ?string $modelLabel = 'doanh nghiệp';

    protected static ?string $pluralModelLabel = 'Doanh nghiệp';

    protected static ?string $recordTitleAttribute = 'name';

    public static function getEloquentQuery(): Builder
    {
        return parent::getEloquentQuery()->with('owner')->withCount('members');
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('created_at', 'desc')
            ->columns([
                TextColumn::make('name')->label('Tên')->searchable(),
                TextColumn::make('owner.name')->label('Chủ'),
                TextColumn::make('owner.phone')->label('SĐT chủ'),
                TextColumn::make('members_count')->label('Tài khoản')->numeric(),
                TextColumn::make('month_buy')->label('Mua tháng này')->state(fn (Business $b): string => TransactionDocuments::vnd((int) Purchase::query()
                    ->where('business_id', $b->id)->where('kind', 'buy')->where('date', '>=', now()->startOfMonth()->toDateString())->sum('amount'))),
                TextColumn::make('created_at')->label('Tạo lúc')->dateTime('d/m/Y'),
            ])
            ->recordActions([ViewAction::make()]);
    }

    public static function infolist(Schema $schema): Schema
    {
        $vnd = fn ($state): string => TransactionDocuments::vnd((int) $state);
        $summary = fn (Business $b): array => BusinessStats::summary($b, CarbonImmutable::today()->startOfMonth(), CarbonImmutable::today());

        return $schema->columns(1)->components([
            Section::make('Doanh nghiệp')->columns(4)->schema([
                TextEntry::make('name')->label('Tên'),
                TextEntry::make('b_owner')->label('Chủ')->state(fn (Business $b): string => $b->owner->name.' · '.$b->owner->phone),
                TextEntry::make('phone')->label('SĐT')->placeholder('—'),
                TextEntry::make('address')->label('Địa chỉ')->placeholder('—'),
            ]),
            Section::make('Từng lái (mua / bán tháng này; đã ứng, đang giữ tính đến nay)')->schema([
                RepeatableEntry::make('members_summary')->hiddenLabel()
                    ->placeholder('Không có')
                    ->state(fn (Business $b): array => array_map(fn (array $m): array => [
                        'name' => $m['name'].($m['role'] === 'owner' ? ' (chủ)' : ''),
                        'group' => $m['group_name'] ?? '',
                        'status' => $m['status'] === 'locked' ? 'Đã khóa' : 'Đang dùng',
                        'buy' => $m['totals']['buy']['amount'],
                        'owing' => $m['totals']['buy']['owing'],
                        'sell' => $m['totals']['sell']['amount'],
                        'advanced' => $m['cash']['advanced'] - $m['cash']['returned'],
                        'holding' => $m['cash']['holding'],
                    ], $summary($b)['members']))
                    ->table([TableColumn::make('Lái'), TableColumn::make('Nhóm'), TableColumn::make('Trạng thái'), TableColumn::make('Mua'), TableColumn::make('Còn nợ ND'), TableColumn::make('Bán'), TableColumn::make('Đã ứng (ròng)'), TableColumn::make('Đang giữ')])
                    ->schema([
                        TextEntry::make('name'),
                        TextEntry::make('group')->placeholder('—'),
                        TextEntry::make('status'),
                        TextEntry::make('buy')->formatStateUsing($vnd),
                        TextEntry::make('owing')->formatStateUsing($vnd),
                        TextEntry::make('sell')->formatStateUsing($vnd),
                        TextEntry::make('advanced')->formatStateUsing($vnd),
                        TextEntry::make('holding')->formatStateUsing($vnd),
                    ]),
            ]),
            Section::make('Tiền ứng gần đây')->collapsible()->schema([
                RepeatableEntry::make('advances_recent')->hiddenLabel()
                    ->placeholder('Không có')
                    ->state(fn (Business $b): array => $b->advances()->with('member')->latest('date')->limit(50)->get()->map(fn (BusinessAdvance $a): array => [
                        'date' => TransactionDocuments::date($a->date),
                        'member' => $a->member?->name ?? '',
                        'kind' => $a->kind === BusinessAdvance::ADVANCE ? 'Chủ ứng' : 'Lái nộp lại',
                        'amount' => $a->amount,
                        'note' => $a->note,
                    ])->all())
                    ->table([TableColumn::make('Ngày'), TableColumn::make('Lái'), TableColumn::make('Loại'), TableColumn::make('Số tiền'), TableColumn::make('Ghi chú')])
                    ->schema([TextEntry::make('date'), TextEntry::make('member'), TextEntry::make('kind'), TextEntry::make('amount')->formatStateUsing($vnd), TextEntry::make('note')->placeholder('—')]),
            ]),
        ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ListBusinesses::route('/'),
            'view' => ViewBusiness::route('/{record}'),
        ];
    }
}
