<?php

namespace App\Filament\Resources\ArticleCategories;

use App\Filament\Resources\ArticleCategories\Pages\ManageArticleCategories;
use App\Models\ArticleCategory;
use BackedEnum;
use Filament\Actions\DeleteAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Resources\Resource;
use Filament\Schemas\Components\Utilities\Set;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Illuminate\Support\Str;
use UnitEnum;

/**
 * Danh mục bài viết (hiện thành các nút lọc trên trang Bài viết của web / app).
 */
class ArticleCategoryResource extends Resource
{
    protected static ?string $model = ArticleCategory::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedFolder;

    protected static string|UnitEnum|null $navigationGroup = 'Nội dung';

    protected static ?int $navigationSort = 2;

    protected static ?string $modelLabel = 'danh mục bài viết';

    protected static ?string $pluralModelLabel = 'Danh mục bài viết';

    protected static ?string $recordTitleAttribute = 'name';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->components([
                TextInput::make('name')
                    ->label('Tên danh mục')
                    ->required()
                    ->maxLength(100)
                    ->live(onBlur: true)
                    ->afterStateUpdated(fn (?string $state, string $operation, Set $set) => $operation === 'create' ? $set('slug', Str::slug((string) $state)) : null),
                TextInput::make('slug')
                    ->label('Đường dẫn')
                    ->helperText('Dùng trong link, vd ky-thuat-canh-tac')
                    ->alphaDash()
                    ->unique(ignoreRecord: true)
                    ->required()
                    ->maxLength(100),
                TextInput::make('icon')
                    ->label('Biểu tượng (emoji)')
                    ->maxLength(16),
                TextInput::make('sort')
                    ->label('Thứ tự')
                    ->numeric()
                    ->default(0),
                TextInput::make('description')
                    ->label('Mô tả ngắn')
                    ->maxLength(255)
                    ->columnSpanFull(),
                Toggle::make('is_active')
                    ->label('Đang hiện')
                    ->default(true),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('sort')
            ->reorderable('sort')
            ->columns([
                TextColumn::make('icon')
                    ->label(''),
                TextColumn::make('name')
                    ->label('Danh mục')
                    ->description(fn (ArticleCategory $record): ?string => $record->description)
                    ->searchable(),
                TextColumn::make('articles_count')
                    ->label('Số bài')
                    ->counts('articles'),
                IconColumn::make('is_active')
                    ->label('Đang hiện')
                    ->boolean(),
            ])
            ->recordActions([
                EditAction::make(),
                DeleteAction::make()
                    ->visible(fn (ArticleCategory $record): bool => ! $record->articles()->exists()),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ManageArticleCategories::route('/'),
        ];
    }
}
