<?php

namespace App\Filament\Resources\Products;

use App\Filament\Resources\Products\Pages\ManageProducts;
use App\Models\Product;
use BackedEnum;
use Filament\Actions\DeleteAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TagsInput;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;
use UnitEnum;

class ProductResource extends Resource
{
    protected static ?string $model = Product::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedShoppingBag;

    protected static string|UnitEnum|null $navigationGroup = 'Danh mục';

    protected static ?int $navigationSort = 1;

    protected static ?string $modelLabel = 'mặt hàng';

    protected static ?string $pluralModelLabel = 'Mặt hàng';

    protected static ?string $recordTitleAttribute = 'name';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                TextInput::make('name')
                    ->label('Tên hiển thị')
                    ->required(),
                TextInput::make('code')
                    ->label('Mã')
                    ->helperText('Chữ thường không dấu, vd: ure-ca-mau')
                    ->alphaDash()
                    ->unique(ignoreRecord: true)
                    ->required(),
                Select::make('category_id')
                    ->label('Danh mục')
                    ->relationship('category', 'name')
                    ->preload()
                    ->required(),
                Select::make('unit')
                    ->label('Đơn vị giá')
                    ->options(['kg' => 'kg', 'bao' => 'bao', 'tấn' => 'tấn', 'tạ' => 'tạ', 'chai' => 'chai', 'gói' => 'gói', 'lít' => 'lít', 'chục' => 'chục'])
                    ->default('kg')
                    ->required(),
                TagsInput::make('aliases')
                    ->label('Tên gọi khác')
                    ->helperText('Các cách báo hay viết, dùng để nhận ra mặt hàng khi lấy giá. Không phân biệt dấu.')
                    ->columnSpanFull(),
                TagsInput::make('context_keywords')
                    ->label('Từ khóa ngữ cảnh')
                    ->helperText('Chỉ cần khi trùng tên với mặt hàng khác, vd lúa "OM 18" dùng "lúa tươi", gạo "OM 18" dùng "gạo nguyên liệu".')
                    ->columnSpanFull(),
                TextInput::make('sort')
                    ->label('Thứ tự')
                    ->numeric()
                    ->default(0),
                Toggle::make('is_active')
                    ->label('Đang hiển thị')
                    ->default(true),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('sort')
            ->columns([
                TextColumn::make('name')
                    ->label('Tên')
                    ->description(fn (Product $record): string => $record->code)
                    ->searchable(['name', 'code']),
                TextColumn::make('category.name')
                    ->label('Danh mục')
                    ->sortable(),
                TextColumn::make('unit')
                    ->label('Đơn vị'),
                TextColumn::make('aliases')
                    ->label('Tên gọi khác')
                    ->badge()
                    ->separator(','),
                IconColumn::make('is_active')
                    ->label('Hiển thị')
                    ->boolean(),
                TextColumn::make('sort')
                    ->label('Thứ tự')
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true),
            ])
            ->filters([
                SelectFilter::make('category_id')
                    ->label('Danh mục')
                    ->relationship('category', 'name')
                    ->preload(),
            ])
            ->recordActions([
                EditAction::make(),
                DeleteAction::make(),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ManageProducts::route('/'),
        ];
    }
}
