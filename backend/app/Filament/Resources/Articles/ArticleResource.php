<?php

namespace App\Filament\Resources\Articles;

use App\Enums\ArticleStatus;
use App\Filament\Resources\Articles\Pages\CreateArticle;
use App\Filament\Resources\Articles\Pages\EditArticle;
use App\Filament\Resources\Articles\Pages\ListArticles;
use App\Filament\Resources\MediaFiles\MediaLibraryEditorPlugin;
use App\Filament\Resources\MediaFiles\MediaPicker;
use App\Models\Article;
use App\Models\MediaFile;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteAction;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\DateTimePicker;
use Filament\Forms\Components\FileUpload;
use Filament\Forms\Components\RichEditor;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Resources\Resource;
use Filament\Schemas\Components\Grid;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Components\Utilities\Set;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\ImageColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;
use Illuminate\Support\Str;
use UnitEnum;

/**
 * Bài viết do admin soạn, hiện ở mục "📰 Bài viết" của web (#/bai-viet).
 */
class ArticleResource extends Resource
{
    protected static ?string $model = Article::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedNewspaper;

    protected static string|UnitEnum|null $navigationGroup = 'Nội dung';

    protected static ?int $navigationSort = 1;

    protected static ?string $modelLabel = 'bài viết';

    protected static ?string $pluralModelLabel = 'Bài viết';

    protected static ?string $recordTitleAttribute = 'title';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->columns(3)
            ->components([
                Section::make('Nội dung')
                    ->columnSpan(2)
                    ->schema([
                        TextInput::make('title')
                            ->label('Tiêu đề')
                            ->required()
                            ->maxLength(255)
                            ->live(onBlur: true)
                            ->afterStateUpdated(fn (?string $state, string $operation, Set $set) => $operation === 'create' ? $set('slug', Str::slug((string) $state)) : null),
                        TextInput::make('slug')
                            ->label('Đường dẫn')
                            ->helperText('Tự sinh từ tiêu đề; đổi sau khi đã đăng sẽ làm hỏng link cũ')
                            ->alphaDash()
                            ->unique(ignoreRecord: true)
                            ->required()
                            ->maxLength(255),
                        Textarea::make('excerpt')
                            ->label('Tóm tắt')
                            ->helperText('Hiện trên thẻ bài trong danh sách (tối đa 300 ký tự)')
                            ->rows(3)
                            ->maxLength(300),
                        RichEditor::make('content')
                            ->label('Nội dung')
                            ->required()
                            ->toolbarButtons([
                                ['bold', 'italic', 'underline', 'link'],
                                ['h2', 'h3'],
                                ['blockquote', 'bulletList', 'orderedList'],
                                ['table', 'attachFiles', MediaLibraryEditorPlugin::TOOL],
                                ['undo', 'redo'],
                            ])
                            ->plugins([MediaLibraryEditorPlugin::make()])
                            ->fileAttachmentsDisk(Article::DISK)
                            ->fileAttachmentsDirectory('articles/content')
                            ->fileAttachmentsVisibility('public')
                            // Ảnh trong bài chỉ được trỏ tới file mới tải lên hoặc file có trong Thư viện ảnh
                            ->preventFileAttachmentPathTampering(allowFilePathUsing: fn (string $file): bool => MediaFile::query()->where('path', $file)->exists()),
                    ]),
                Grid::make(1)
                    ->columnSpan(1)
                    ->schema([
                        Section::make('Đăng bài')
                            ->schema([
                                Select::make('status')
                                    ->label('Trạng thái')
                                    ->options(ArticleStatus::class)
                                    ->default(ArticleStatus::Draft)
                                    ->required(),
                                DateTimePicker::make('published_at')
                                    ->label('Ngày đăng')
                                    ->helperText('Để ngày trong tương lai = hẹn giờ đăng. Bỏ trống thì lấy lúc bấm Lưu.')
                                    ->seconds(false),
                                Toggle::make('is_featured')
                                    ->label('Bài nổi bật')
                                    ->helperText('Hiện to ở đầu trang Bài viết'),
                            ]),
                        Section::make('Phân loại')
                            ->schema([
                                Select::make('article_category_id')
                                    ->label('Danh mục')
                                    ->relationship('category', 'name')
                                    ->preload()
                                    ->required(),
                                Select::make('products')
                                    ->label('Mặt hàng liên quan')
                                    ->helperText('Bài sẽ hiện ở trang giá của các mặt hàng này')
                                    ->relationship('products', 'name')
                                    ->multiple()
                                    ->preload()
                                    ->searchable(),
                            ]),
                        Section::make('Ảnh bìa')
                            ->schema([
                                FileUpload::make('cover_image')
                                    ->hiddenLabel()
                                    ->hintAction(
                                        Action::make('pickCover')
                                            ->label('Chọn từ thư viện')
                                            ->icon(Heroicon::OutlinedPhoto)
                                            ->modalHeading('Chọn ảnh bìa từ thư viện')
                                            ->modalSubmitActionLabel('Dùng ảnh này')
                                            ->schema([MediaPicker::make()])
                                            ->action(function (array $data, Set $set): void {
                                                $file = MediaFile::query()->images()->find($data['media_file_id']);
                                                if ($file !== null) {
                                                    $set('cover_image', [(string) Str::uuid() => $file->path]);
                                                }
                                            }),
                                    )
                                    ->image()
                                    ->imageEditor()
                                    ->disk(Article::DISK)
                                    ->directory('articles/covers')
                                    ->visibility('public')
                                    ->maxSize(4096),
                            ]),
                        Section::make('Nguồn tham khảo')
                            ->description('Ghi nguồn khi tham khảo báo / tài liệu; không chép nguyên bài')
                            ->collapsed()
                            ->schema([
                                TextInput::make('source_name')
                                    ->label('Tên nguồn')
                                    ->maxLength(255),
                                TextInput::make('source_url')
                                    ->label('Link nguồn')
                                    ->url()
                                    ->maxLength(500),
                            ]),
                    ]),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('published_at', 'desc')
            ->columns([
                ImageColumn::make('cover_image')
                    ->label('')
                    ->disk(Article::DISK)
                    ->imageHeight(40),
                TextColumn::make('title')
                    ->label('Tiêu đề')
                    ->searchable()
                    ->limit(70)
                    ->description(fn (Article $record): ?string => $record->is_featured ? '⭐ Nổi bật' : null),
                TextColumn::make('category.name')
                    ->label('Danh mục'),
                TextColumn::make('status')
                    ->label('Trạng thái')
                    ->badge()
                    ->description(fn (Article $record): ?string => $record->status === ArticleStatus::Published && $record->published_at?->isFuture() ? 'Hẹn giờ' : null),
                TextColumn::make('published_at')
                    ->label('Ngày đăng')
                    ->dateTime('d/m/Y H:i')
                    ->sortable(),
                TextColumn::make('views')
                    ->label('Lượt xem')
                    ->sortable(),
                IconColumn::make('is_featured')
                    ->label('Nổi bật')
                    ->boolean()
                    ->toggleable(isToggledHiddenByDefault: true),
            ])
            ->filters([
                SelectFilter::make('article_category_id')->label('Danh mục')->relationship('category', 'name'),
                SelectFilter::make('status')->label('Trạng thái')->options(ArticleStatus::class),
            ])
            ->recordActions([
                Action::make('view')
                    ->label('Xem trên web')
                    ->icon(Heroicon::OutlinedArrowTopRightOnSquare)
                    ->url(fn (Article $record): string => self::webUrl($record), shouldOpenInNewTab: true)
                    ->visible(fn (Article $record): bool => filled(config('nhanong.web_url')) && $record->isPublished()),
                EditAction::make(),
                DeleteAction::make(),
            ])
            ->toolbarActions([
                BulkActionGroup::make([
                    DeleteBulkAction::make(),
                ]),
            ]);
    }

    public static function webUrl(Article $article): string
    {
        return rtrim((string) config('nhanong.web_url'), '/').'/#/bai-viet/'.$article->slug;
    }

    /**
     * Đăng mà chưa chọn ngày thì lấy lúc lưu.
     *
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public static function fillPublishedAt(array $data): array
    {
        $status = $data['status'] ?? null;
        $isPublished = $status === ArticleStatus::Published || $status === ArticleStatus::Published->value;
        if ($isPublished && blank($data['published_at'] ?? null)) {
            $data['published_at'] = now();
        }

        return $data;
    }

    public static function getPages(): array
    {
        return [
            'index' => ListArticles::route('/'),
            'create' => CreateArticle::route('/create'),
            'edit' => EditArticle::route('/{record}/edit'),
        ];
    }
}
