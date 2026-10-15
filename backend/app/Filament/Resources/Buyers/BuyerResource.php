<?php

namespace App\Filament\Resources\Buyers;

use App\Enums\BuyerKind;
use App\Enums\BuyerStatus;
use App\Enums\ShopType;
use App\Filament\Resources\Buyers\Pages\ManageBuyers;
use App\Models\Buyer;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Actions\DeleteAction;
use Filament\Forms\Components\Textarea;
use Filament\Resources\Resource;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;
use UnitEnum;

/** Duyệt hồ sơ điểm mua: chỉ điểm đã duyệt mới đăng giá được */
class BuyerResource extends Resource
{
    protected static ?string $model = Buyer::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedBuildingStorefront;

    protected static string|UnitEnum|null $navigationGroup = 'Giá theo khu vực';

    protected static ?int $navigationSort = 1;

    protected static ?string $modelLabel = 'điểm mua';

    protected static ?string $pluralModelLabel = 'Điểm mua đăng giá';

    public static function getNavigationBadge(): ?string
    {
        $count = Buyer::query()->where('status', BuyerStatus::Pending)->count();

        return $count > 0 ? (string) $count : null;
    }

    public static function getNavigationBadgeColor(): string
    {
        return 'warning';
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('created_at', 'desc')
            ->columns([
                TextColumn::make('created_at')->label('Ngày gửi')->dateTime('d/m/Y H:i')->sortable(),
                TextColumn::make('name')->label('Tên')->searchable()->wrap()
                    ->description(fn (Buyer $record): string => $record->kind->getLabel().' · '.$record->deals_in->map(fn (ShopType $t): string => $t->getLabel())->join(', ')),
                TextColumn::make('user.phone')->label('Tài khoản')->searchable(),
                TextColumn::make('phone')->label('SĐT điểm mua'),
                TextColumn::make('address')->label('Địa chỉ')->wrap()
                    ->description(fn (Buyer $record): string => ($record->provinceName() ?? '').' · '.round($record->lat, 4).', '.round($record->lng, 4)),
                TextColumn::make('reports_count')->label('Số giá đã đăng')->counts('reports')->sortable(),
                IconColumn::make('is_verified')->label('Xác minh')->boolean(),
                TextColumn::make('status')->label('Trạng thái')->badge(),
            ])
            ->filters([
                SelectFilter::make('status')->label('Trạng thái')->options(BuyerStatus::class)->default(BuyerStatus::Pending->value),
                SelectFilter::make('kind')->label('Loại')->options(BuyerKind::class),
            ])
            ->recordActions([
                Action::make('approve')
                    ->label('Duyệt')
                    ->icon(Heroicon::OutlinedCheck)
                    ->color('success')
                    ->visible(fn (Buyer $record): bool => $record->status !== BuyerStatus::Approved)
                    ->requiresConfirmation()
                    ->modalDescription('Điểm mua sẽ đăng giá được và hiện trong danh sách Điểm bán.')
                    ->action(fn (Buyer $record) => $record->approve()),
                Action::make('verify')
                    ->label(fn (Buyer $record): string => $record->is_verified ? 'Bỏ xác minh' : 'Xác minh ✓')
                    ->icon(Heroicon::OutlinedShieldCheck)
                    ->color('info')
                    ->visible(fn (Buyer $record): bool => $record->status === BuyerStatus::Approved)
                    ->action(function (Buyer $record): void {
                        $record->update(['is_verified' => ! $record->is_verified]);
                        $record->syncShop();
                    }),
                Action::make('reject')
                    ->label(fn (Buyer $record): string => $record->status === BuyerStatus::Approved ? 'Tạm khóa' : 'Không duyệt')
                    ->icon(Heroicon::OutlinedXMark)
                    ->color('danger')
                    ->visible(fn (Buyer $record): bool => in_array($record->status, [BuyerStatus::Pending, BuyerStatus::Approved], true))
                    ->schema([Textarea::make('note')->label('Lý do (người đăng ký sẽ thấy)')->maxLength(255)])
                    ->action(fn (Buyer $record, array $data) => $record->status === BuyerStatus::Approved ? $record->suspend($data['note'] ?? null) : $record->reject($data['note'] ?? null)),
                DeleteAction::make(),
            ]);
    }

    public static function getPages(): array
    {
        return ['index' => ManageBuyers::route('/')];
    }
}
