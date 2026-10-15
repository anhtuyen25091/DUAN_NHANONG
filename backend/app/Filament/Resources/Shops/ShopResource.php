<?php

namespace App\Filament\Resources\Shops;

use App\Enums\ShopType;
use App\Filament\Resources\Shops\Pages\ManageShops;
use App\Models\Shop;
use App\Support\Provinces;
use BackedEnum;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteAction;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\CheckboxList;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Filters\TernaryFilter;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use UnitEnum;

class ShopResource extends Resource
{
    protected static ?string $model = Shop::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedBuildingStorefront;

    protected static string|UnitEnum|null $navigationGroup = 'Điểm bán';

    protected static ?int $navigationSort = 1;

    protected static ?string $modelLabel = 'điểm bán';

    protected static ?string $pluralModelLabel = 'Điểm bán';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                TextInput::make('name')
                    ->label('Tên')
                    ->required()
                    ->columnSpanFull(),
                CheckboxList::make('types')
                    ->label('Loại')
                    ->options(ShopType::class)
                    ->required()
                    ->columns(3)
                    ->columnSpanFull(),
                TextInput::make('address')
                    ->label('Địa chỉ')
                    ->columnSpanFull(),
                Select::make('province_code')
                    ->label('Tỉnh/thành')
                    ->options(Provinces::options())
                    ->searchable(),
                TextInput::make('phone')
                    ->label('Số điện thoại')
                    ->tel(),
                TextInput::make('lat')
                    ->label('Vĩ độ')
                    ->numeric(),
                TextInput::make('lng')
                    ->label('Kinh độ')
                    ->numeric(),
                TextInput::make('goods')
                    ->label('Mặt hàng')
                    ->placeholder('VD: thu mua cà phê, tiêu')
                    ->columnSpanFull(),
                TextInput::make('opening_hours')
                    ->label('Giờ mở cửa'),
                Toggle::make('is_verified')
                    ->label('Đã xác minh')
                    ->helperText('Điểm đã xác minh không bị ghi đè khi nhập lại từ OSM.'),
                Toggle::make('is_active')
                    ->label('Hiển thị')
                    ->default(true),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('name')
            ->columns([
                TextColumn::make('name')
                    ->label('Tên')
                    ->searchable()
                    ->description(fn (Shop $record): ?string => $record->address),
                TextColumn::make('types')
                    ->label('Loại')
                    ->badge(),
                TextColumn::make('province_code')
                    ->label('Tỉnh/thành')
                    ->formatStateUsing(fn (?string $state): ?string => Provinces::name($state))
                    ->sortable(),
                TextColumn::make('phone')
                    ->label('Điện thoại'),
                TextColumn::make('source')
                    ->label('Nguồn')
                    ->badge()
                    ->toggleable(),
                IconColumn::make('is_verified')
                    ->label('Xác minh')
                    ->boolean(),
                IconColumn::make('is_active')
                    ->label('Hiển thị')
                    ->boolean()
                    ->toggleable(),
            ])
            ->filters([
                SelectFilter::make('type')
                    ->label('Loại')
                    ->options(ShopType::class)
                    ->query(fn (Builder $query, array $data) => $data['value'] ? $query->ofType(ShopType::from($data['value'])) : $query),
                SelectFilter::make('province_code')
                    ->label('Tỉnh/thành')
                    ->options(Provinces::options())
                    ->searchable(),
                SelectFilter::make('source')
                    ->label('Nguồn')
                    ->options(['osm' => 'OpenStreetMap', 'import' => 'Nhập file', 'user' => 'Người dùng', 'admin' => 'Admin']),
                TernaryFilter::make('is_verified')
                    ->label('Đã xác minh'),
            ])
            ->recordActions([
                EditAction::make(),
                DeleteAction::make(),
            ])
            ->toolbarActions([
                BulkActionGroup::make([
                    DeleteBulkAction::make(),
                ]),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ManageShops::route('/'),
        ];
    }
}
