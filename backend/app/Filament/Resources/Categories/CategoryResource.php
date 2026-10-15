<?php

namespace App\Filament\Resources\Categories;

use App\Enums\CategoryType;
use App\Filament\Resources\Categories\Pages\ManageCategories;
use App\Models\Category;
use BackedEnum;
use Filament\Actions\DeleteAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use UnitEnum;

class CategoryResource extends Resource
{
    protected static ?string $model = Category::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedFolder;

    protected static string|UnitEnum|null $navigationGroup = 'Danh mục';

    protected static ?int $navigationSort = 2;

    protected static ?string $modelLabel = 'danh mục';

    protected static ?string $pluralModelLabel = 'Danh mục';

    protected static ?string $recordTitleAttribute = 'name';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                TextInput::make('name')
                    ->label('Tên')
                    ->required(),
                TextInput::make('slug')
                    ->label('Mã')
                    ->alphaDash()
                    ->unique(ignoreRecord: true)
                    ->required(),
                Select::make('type')
                    ->label('Loại')
                    ->options(CategoryType::class)
                    ->required(),
                Select::make('parent_id')
                    ->label('Danh mục cha')
                    ->relationship('parent', 'name'),
                TextInput::make('sort')
                    ->label('Thứ tự')
                    ->numeric()
                    ->default(0),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('sort')
            ->columns([
                TextColumn::make('name')
                    ->label('Tên')
                    ->description(fn (Category $record): string => $record->slug)
                    ->searchable(),
                TextColumn::make('type')
                    ->label('Loại')
                    ->badge(),
                TextColumn::make('products_count')
                    ->label('Số mặt hàng')
                    ->counts('products'),
                TextColumn::make('sort')
                    ->label('Thứ tự')
                    ->sortable(),
            ])
            ->recordActions([
                EditAction::make(),
                DeleteAction::make(),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ManageCategories::route('/'),
        ];
    }
}
