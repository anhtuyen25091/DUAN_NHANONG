<?php

namespace App\Filament\Resources\MediaFiles;

use App\Filament\Resources\Articles\ArticleResource;
use App\Filament\Resources\MediaFiles\Pages\ManageMediaFiles;
use App\Models\Article;
use App\Models\MediaFile;
use App\Models\MediaUsage;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Actions\BulkAction;
use Filament\Actions\DeleteAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\TextInput;
use Filament\Infolists\Components\TextEntry;
use Filament\Notifications\Notification;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\ImageColumn;
use Filament\Tables\Columns\Layout\Stack;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Filters\TernaryFilter;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\HtmlString;
use UnitEnum;

/**
 * Thư viện ảnh & file: mọi file trên ổ public (tải lên để dùng ngoài, ảnh bìa, ảnh trong bài viết),
 * xem đang dùng ở đâu, lấy link công khai, xóa file không còn dùng.
 */
class MediaFileResource extends Resource
{
    protected static ?string $model = MediaFile::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedPhoto;

    protected static string|UnitEnum|null $navigationGroup = 'Nội dung';

    protected static ?int $navigationSort = 3;

    protected static ?string $slug = 'media';

    protected static ?string $modelLabel = 'file';

    protected static ?string $pluralModelLabel = 'Thư viện ảnh & file';

    protected static ?string $recordTitleAttribute = 'name';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->columns(1)
            ->components([
                TextEntry::make('preview')
                    ->hiddenLabel()
                    ->state(fn (MediaFile $record): HtmlString => new HtmlString($record->isImage()
                        ? '<img src="'.e($record->url()).'" alt="" style="max-height:260px;border-radius:8px;margin:auto">'
                        : '<p>📄 '.e(basename($record->path)).'</p>')),
                TextInput::make('name')
                    ->label('Tên')
                    ->helperText('Tên để tìm trong thư viện, không đổi link của file')
                    ->required()
                    ->maxLength(255),
                TextInput::make('alt')
                    ->label('Mô tả ảnh (alt)')
                    ->helperText('Điền sẵn khi chèn ảnh này vào bài viết')
                    ->maxLength(500)
                    ->visible(fn (MediaFile $record): bool => $record->isImage()),
                TextInput::make('public_url')
                    ->label('Link công khai')
                    ->helperText('Dán link này vào web khác, Zalo, Facebook… File phải còn trong thư viện thì link mới mở được.')
                    ->formatStateUsing(fn (MediaFile $record): string => $record->url())
                    ->readOnly()
                    ->dehydrated(false)
                    ->copyable(copyMessage: 'Đã sao chép link'),
                TextEntry::make('used_in')
                    ->label('Đang dùng ở')
                    ->state(fn (MediaFile $record): HtmlString|string => self::usageList($record)),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->modifyQueryUsing(fn (Builder $query) => $query->withCount('usages'))
            ->defaultSort('id', 'desc')
            ->contentGrid(['sm' => 2, 'lg' => 3, 'xl' => 4])
            ->paginated([24, 48, 96])
            ->columns([
                Stack::make([
                    ImageColumn::make('path')
                        ->disk(MediaFile::DISK)
                        ->state(fn (MediaFile $record): ?string => $record->isImage() ? $record->path : null)
                        ->imageHeight(150)
                        ->extraImgAttributes(['style' => 'width:100%;object-fit:cover;border-radius:8px', 'loading' => 'lazy']),
                    TextColumn::make('file_type')
                        ->state(fn (MediaFile $record): ?string => $record->isImage() ? null : '📄 '.strtoupper(pathinfo($record->path, PATHINFO_EXTENSION)))
                        ->size('lg'),
                    TextColumn::make('name')
                        ->searchable(['name', 'alt', 'path'])
                        ->weight('bold')
                        ->limit(40),
                    TextColumn::make('details')
                        ->state(fn (MediaFile $record): string => $record->details())
                        ->color('gray')
                        ->size('sm'),
                    TextColumn::make('folder')
                        ->formatStateUsing(fn (MediaFile $record): string => $record->folderLabel())
                        ->badge()
                        ->color('gray'),
                    TextColumn::make('usages_count')
                        ->formatStateUsing(fn (int $state): string => $state > 0 ? "Đang dùng ở {$state} chỗ" : 'Chưa dùng')
                        ->badge()
                        ->color(fn (int $state): string => $state > 0 ? 'success' : 'warning'),
                ])->space(2),
            ])
            ->filters([
                SelectFilter::make('folder')
                    ->label('Thư mục')
                    ->options(fn (): array => MediaFile::query()->distinct()->orderBy('folder')->pluck('folder')
                        ->mapWithKeys(fn (string $folder): array => [$folder => MediaFile::FOLDERS[$folder] ?? $folder])->all()),
                TernaryFilter::make('image')
                    ->label('Loại file')
                    ->trueLabel('Ảnh')
                    ->falseLabel('Tài liệu (PDF, Word, Excel…)')
                    ->queries(
                        true: fn (Builder $query) => $query->images(),
                        false: fn (Builder $query) => $query->where(fn (Builder $query) => $query->whereNull('mime_type')->orWhere('mime_type', 'not like', 'image/%')),
                    ),
                TernaryFilter::make('used')
                    ->label('Tình trạng')
                    ->trueLabel('Đang dùng')
                    ->falseLabel('Chưa dùng (có thể xóa)')
                    ->queries(
                        true: fn (Builder $query) => $query->whereHas('usages'),
                        false: fn (Builder $query) => $query->unused(),
                    ),
            ])
            ->recordActions([
                Action::make('open')
                    ->label('Mở')
                    ->icon(Heroicon::OutlinedArrowTopRightOnSquare)
                    ->url(fn (MediaFile $record): string => $record->url(), shouldOpenInNewTab: true),
                EditAction::make()->label('Chi tiết'),
                DeleteAction::make()
                    ->modalDescription('File sẽ bị xóa khỏi máy chủ; link công khai của file không mở được nữa.')
                    ->hidden(fn (MediaFile $record): bool => $record->usages_count > 0),
            ])
            ->toolbarActions([
                BulkAction::make('deleteUnused')
                    ->label('Xóa file chưa dùng')
                    ->icon(Heroicon::OutlinedTrash)
                    ->color('danger')
                    ->requiresConfirmation()
                    ->modalDescription('Chỉ xóa các file đã chọn mà chưa dùng ở đâu; file đang dùng được giữ lại.')
                    ->deselectRecordsAfterCompletion()
                    ->action(function (Collection $records): void {
                        $unused = $records->filter(fn (MediaFile $file): bool => ! $file->usages()->exists());
                        $unused->each->delete();
                        $kept = $records->count() - $unused->count();

                        Notification::make()->success()
                            ->title("Đã xóa {$unused->count()} file")
                            ->body($kept > 0 ? "Giữ lại {$kept} file đang dùng." : null)
                            ->send();
                    }),
            ]);
    }

    private static function usageList(MediaFile $record): HtmlString|string
    {
        $usages = $record->usages()->with('usable')->get();
        if ($usages->isEmpty()) {
            return 'Chưa dùng ở đâu';
        }

        return new HtmlString($usages->map(function (MediaUsage $usage): string {
            $usable = $usage->usable;
            if ($usable instanceof Article) {
                $link = ArticleResource::getUrl('edit', ['record' => $usable]);

                return '<a href="'.e($link).'" class="text-primary-600 underline">Bài viết: '.e($usable->title).'</a> ('.e($usage->fieldLabel()).')';
            }

            return e(class_basename($usage->usable_type).' #'.$usage->usable_id);
        })->implode('<br>'));
    }

    public static function getPages(): array
    {
        return [
            'index' => ManageMediaFiles::route('/'),
        ];
    }
}
