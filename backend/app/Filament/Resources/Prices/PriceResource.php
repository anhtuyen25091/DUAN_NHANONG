<?php

namespace App\Filament\Resources\Prices;

use App\Enums\PriceStatus;
use App\Filament\Resources\Prices\Pages\ManagePrices;
use App\Models\Price;
use App\Models\Product;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Actions\BulkAction;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteAction;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\DatePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Resources\Resource;
use Filament\Schemas\Components\Utilities\Set;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Collection;
use UnitEnum;

class PriceResource extends Resource
{
    protected static ?string $model = Price::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedCurrencyDollar;

    protected static string|UnitEnum|null $navigationGroup = 'Giá cả';

    protected static ?int $navigationSort = 1;

    protected static ?string $modelLabel = 'giá';

    protected static ?string $pluralModelLabel = 'Giá';

    public static function getNavigationBadge(): ?string
    {
        $count = Price::query()->where('status', PriceStatus::NeedsReview)->count();

        return $count > 0 ? (string) $count : null;
    }

    public static function getNavigationBadgeColor(): string
    {
        return 'warning';
    }

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                Select::make('product_id')
                    ->label('Mặt hàng')
                    ->relationship('product', 'name')
                    ->searchable()
                    ->preload()
                    ->live()
                    ->afterStateUpdated(fn (?string $state, Set $set) => $set('unit', Product::query()->find($state)?->unit))
                    ->required(),
                Select::make('region_id')
                    ->label('Khu vực')
                    ->relationship('region', 'name')
                    ->searchable()
                    ->preload()
                    ->required(),
                Select::make('price_source_id')
                    ->label('Nguồn')
                    ->relationship('priceSource', 'name')
                    ->placeholder('Nhập tay'),
                DatePicker::make('date')
                    ->label('Ngày')
                    ->default(now())
                    ->required(),
                TextInput::make('price_min')
                    ->label('Giá thấp nhất')
                    ->numeric()
                    ->minValue(0)
                    ->suffix('đ')
                    ->required(),
                TextInput::make('price_max')
                    ->label('Giá cao nhất')
                    ->numeric()
                    ->minValue(0)
                    ->suffix('đ')
                    ->gte('price_min')
                    ->required(),
                TextInput::make('price_avg')
                    ->label('Giá phổ biến')
                    ->numeric()
                    ->minValue(0)
                    ->suffix('đ')
                    ->required(),
                TextInput::make('unit')
                    ->label('Đơn vị')
                    ->required(),
                Select::make('status')
                    ->label('Trạng thái')
                    ->options(PriceStatus::class)
                    ->default(PriceStatus::Published)
                    ->required(),
                TextInput::make('note')
                    ->label('Ghi chú'),
                TextInput::make('source_url')
                    ->label('Link bài nguồn')
                    ->url()
                    ->columnSpanFull(),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('date', 'desc')
            ->columns([
                TextColumn::make('date')
                    ->label('Ngày')
                    ->date('d/m/Y')
                    ->sortable(),
                TextColumn::make('product.name')
                    ->label('Mặt hàng')
                    ->searchable(),
                TextColumn::make('region.name')
                    ->label('Khu vực')
                    ->searchable(),
                TextColumn::make('price_avg')
                    ->label('Giá phổ biến')
                    ->numeric(thousandsSeparator: '.')
                    ->description(fn (Price $record): string => number_format($record->price_min, 0, ',', '.').' - '.number_format($record->price_max, 0, ',', '.'))
                    ->sortable(),
                TextColumn::make('unit')
                    ->label('Đơn vị'),
                TextColumn::make('status')
                    ->label('Trạng thái')
                    ->badge(),
                TextColumn::make('priceSource.name')
                    ->label('Nguồn')
                    ->placeholder('Nhập tay')
                    ->url(fn (Price $record): ?string => $record->source_url, shouldOpenInNewTab: true)
                    ->toggleable(),
                TextColumn::make('updated_at')
                    ->label('Cập nhật')
                    ->dateTime('d/m/Y H:i')
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true),
            ])
            ->filters([
                SelectFilter::make('status')
                    ->label('Trạng thái')
                    ->options(PriceStatus::class),
                SelectFilter::make('product_id')
                    ->label('Mặt hàng')
                    ->relationship('product', 'name')
                    ->searchable()
                    ->preload(),
                SelectFilter::make('region_id')
                    ->label('Khu vực')
                    ->relationship('region', 'name')
                    ->preload(),
                SelectFilter::make('price_source_id')
                    ->label('Nguồn')
                    ->relationship('priceSource', 'name')
                    ->preload(),
            ])
            ->recordActions([
                Action::make('approve')
                    ->label('Duyệt')
                    ->icon(Heroicon::OutlinedCheck)
                    ->color('success')
                    ->visible(fn (Price $record): bool => $record->status !== PriceStatus::Published)
                    ->action(fn (Price $record) => $record->update(['status' => PriceStatus::Published])),
                Action::make('reject')
                    ->label('Loại')
                    ->icon(Heroicon::OutlinedXMark)
                    ->color('danger')
                    ->visible(fn (Price $record): bool => $record->status === PriceStatus::NeedsReview)
                    ->action(fn (Price $record) => $record->update(['status' => PriceStatus::Rejected])),
                EditAction::make(),
                DeleteAction::make(),
            ])
            ->toolbarActions([
                BulkActionGroup::make([
                    BulkAction::make('approve')
                        ->label('Duyệt các giá đã chọn')
                        ->icon(Heroicon::OutlinedCheck)
                        ->action(fn (Collection $records) => $records->each->update(['status' => PriceStatus::Published])),
                    DeleteBulkAction::make(),
                ]),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ManagePrices::route('/'),
        ];
    }
}
