<?php

namespace App\Filament\Resources\LedgerAccounts;

use App\Documents\TransactionDocuments;
use App\Filament\Concerns\ReadOnlyResource;
use App\Filament\Resources\LedgerAccounts\Pages\ListLedgerAccounts;
use App\Filament\Resources\LedgerAccounts\Pages\ViewLedgerAccount;
use App\Models\User;
use App\Support\LedgerReader;
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
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use UnitEnum;

/**
 * Sổ thu chi của người dùng bật "Lưu cả trên mạng" (bảng ledger_records). Chỉ xem; mở chi tiết thì ghi nhật ký.
 */
class LedgerAccountResource extends Resource
{
    use ReadOnlyResource;

    protected static ?string $model = User::class;

    protected static ?string $slug = 'ledger-accounts';

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedBookOpen;

    protected static string|UnitEnum|null $navigationGroup = 'Giao dịch người dùng';

    protected static ?int $navigationSort = 1;

    protected static ?string $modelLabel = 'sổ thu chi';

    protected static ?string $pluralModelLabel = 'Sổ thu chi đồng bộ';

    protected static ?string $recordTitleAttribute = 'name';

    /** @var array<int, LedgerReader> đọc sổ 1 lần cho mỗi người trong 1 lần tải trang */
    private static array $readers = [];

    public static function reader(User $user): LedgerReader
    {
        return self::$readers[$user->id] ??= new LedgerReader($user);
    }

    public static function getEloquentQuery(): Builder
    {
        return parent::getEloquentQuery()
            ->whereHas('ledgerRecords')
            ->withCount([
                'ledgerRecords as gardens_count' => fn (Builder $q) => $q->where('tbl', 'gardens')->where('is_deleted', false),
                'ledgerRecords as transactions_count' => fn (Builder $q) => $q->where('tbl', 'transactions')->where('is_deleted', false),
            ])
            ->withMax('ledgerRecords as last_sync_at', 'updated_at');
    }

    public static function table(Table $table): Table
    {
        $vnd = fn (int $state): string => TransactionDocuments::vnd($state);

        return $table
            ->defaultSort('last_sync_at', 'desc')
            ->columns([
                TextColumn::make('name')->label('Tên')->searchable(),
                TextColumn::make('phone')->label('SĐT')->searchable(),
                TextColumn::make('gardens_count')->label('Vườn')->numeric(),
                TextColumn::make('transactions_count')->label('Khoản thu chi')->numeric(),
                TextColumn::make('income')->label('Tổng thu')->state(fn (User $r): string => $vnd(self::reader($r)->totals()['income'])),
                TextColumn::make('expense')->label('Tổng chi')->state(fn (User $r): string => $vnd(self::reader($r)->totals()['expense'])),
                TextColumn::make('last_sync_at')->label('Đồng bộ lần cuối')->dateTime('d/m/Y H:i')->sortable(),
            ])
            ->recordActions([ViewAction::make()->label('Xem sổ')]);
    }

    public static function infolist(Schema $schema): Schema
    {
        $vnd = fn ($state): string => TransactionDocuments::vnd((int) $state);
        $date = fn ($state): string => $state ? TransactionDocuments::date((string) $state) : '';

        return $schema->columns(1)->components([
            Section::make('Tổng cả sổ')
                ->description('Theo dữ liệu gốc người dùng đồng bộ (vật tư mua về tính vào "Chi chung").')
                ->columns(4)
                ->schema([
                    TextEntry::make('phone')->label('SĐT'),
                    TextEntry::make('sum_income')->label('Tổng thu')->state(fn (User $r): string => $vnd(self::reader($r)->totals()['income'])),
                    TextEntry::make('sum_expense')->label('Tổng chi')->state(fn (User $r): string => $vnd(self::reader($r)->totals()['expense'])),
                    TextEntry::make('sum_profit')->label('Lời / lỗ')->state(fn (User $r): string => $vnd(self::reader($r)->totals()['profit'])),
                ]),
            Section::make('Theo vườn')->schema([
                RepeatableEntry::make('by_garden')->hiddenLabel()
                    ->placeholder('Không có')
                    ->state(fn (User $r): array => self::reader($r)->totals()['gardens'])
                    ->table([TableColumn::make('Vườn'), TableColumn::make('Thu'), TableColumn::make('Chi'), TableColumn::make('Lời / lỗ')])
                    ->schema([
                        TextEntry::make('name'),
                        TextEntry::make('income')->formatStateUsing($vnd),
                        TextEntry::make('expense')->formatStateUsing($vnd),
                        TextEntry::make('profit')->formatStateUsing($vnd),
                    ]),
            ]),
            Section::make('Khoản thu / chi')->schema([
                RepeatableEntry::make('entries')->hiddenLabel()
                    ->placeholder('Không có')
                    ->state(fn (User $r): array => self::reader($r)->transactions())
                    ->table([TableColumn::make('Ngày'), TableColumn::make('Thu / chi'), TableColumn::make('Vườn'), TableColumn::make('Hạng mục'), TableColumn::make('Số tiền'), TableColumn::make('Ghi chú')])
                    ->schema([
                        TextEntry::make('date')->formatStateUsing($date),
                        TextEntry::make('type_label')->badge()->color(fn (string $state): string => $state === 'Thu' ? 'success' : 'danger'),
                        TextEntry::make('garden'),
                        TextEntry::make('category'),
                        TextEntry::make('amount')->formatStateUsing($vnd),
                        TextEntry::make('note')->placeholder('—'),
                    ]),
            ]),
            Section::make('Công nợ, tiền vay')->collapsible()->schema([
                RepeatableEntry::make('debts')->hiddenLabel()
                    ->placeholder('Không có')
                    ->state(fn (User $r): array => self::reader($r)->debts())
                    ->table([TableColumn::make('Loại'), TableColumn::make('Bên kia'), TableColumn::make('Ngày'), TableColumn::make('Hạn'), TableColumn::make('Số nợ'), TableColumn::make('Đã trả'), TableColumn::make('Còn lại')])
                    ->schema([
                        TextEntry::make('kind'),
                        TextEntry::make('party'),
                        TextEntry::make('date')->formatStateUsing($date),
                        TextEntry::make('due_on')->formatStateUsing($date)->placeholder('—'),
                        TextEntry::make('amount')->formatStateUsing($vnd),
                        TextEntry::make('paid')->formatStateUsing($vnd),
                        TextEntry::make('left')->formatStateUsing($vnd),
                    ]),
            ]),
            Section::make('Bán cho lái (cọc + đợt cắt)')->collapsible()->schema([
                RepeatableEntry::make('contracts')->hiddenLabel()
                    ->placeholder('Không có')
                    ->state(fn (User $r): array => self::reader($r)->contracts())
                    ->table([TableColumn::make('Lái'), TableColumn::make('Vườn'), TableColumn::make('Ngày cọc'), TableColumn::make('Cọc'), TableColumn::make('Số đợt'), TableColumn::make('Tiền hàng'), TableColumn::make('Trạng thái')])
                    ->schema([
                        TextEntry::make('buyer'),
                        TextEntry::make('garden'),
                        TextEntry::make('date')->formatStateUsing($date),
                        TextEntry::make('deposit')->formatStateUsing($vnd),
                        TextEntry::make('cuts'),
                        TextEntry::make('value')->formatStateUsing($vnd),
                        TextEntry::make('status'),
                    ]),
            ]),
        ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ListLedgerAccounts::route('/'),
            'view' => ViewLedgerAccount::route('/{record}'),
        ];
    }
}
