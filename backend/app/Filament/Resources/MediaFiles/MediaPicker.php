<?php

namespace App\Filament\Resources\MediaFiles;

use App\Models\MediaFile;
use Filament\Forms\Components\Select;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;

/**
 * Ô chọn ảnh có sẵn trong Thư viện ảnh (có ảnh thu nhỏ), dùng cho ảnh bìa và nút chèn ảnh trong bài.
 */
class MediaPicker
{
    private const LIMIT = 50;

    public static function make(string $name = 'media_file_id'): Select
    {
        return Select::make($name)
            ->label('Ảnh trong thư viện')
            ->helperText('Gõ tên ảnh để tìm. Ảnh mới tải lên ở mục Nội dung → Thư viện ảnh & file.')
            ->allowHtml()
            ->searchable()
            ->required()
            ->options(fn (): array => self::labels(MediaFile::query()->images()->latest('id')->limit(self::LIMIT)->get()))
            ->getSearchResultsUsing(fn (string $search): array => self::labels(
                MediaFile::query()->images()
                    ->where(fn (Builder $query) => $query->where('name', 'like', "%{$search}%")->orWhere('alt', 'like', "%{$search}%"))
                    ->latest('id')->limit(self::LIMIT)->get(),
            ))
            ->getOptionLabelUsing(fn (mixed $value): ?string => ($file = MediaFile::query()->find($value)) ? self::label($file) : null);
    }

    /**
     * @param  Collection<int, MediaFile>  $files
     * @return array<int, string>
     */
    private static function labels(Collection $files): array
    {
        return $files->mapWithKeys(fn (MediaFile $file): array => [$file->id => self::label($file)])->all();
    }

    private static function label(MediaFile $file): string
    {
        return sprintf(
            '<span style="display:flex;align-items:center;gap:.6rem"><img src="%s" alt="" style="width:56px;height:40px;object-fit:cover;border-radius:4px;flex:none"><span>%s<br><small style="opacity:.65">%s · %s</small></span></span>',
            e($file->url()),
            e($file->name),
            e($file->folderLabel()),
            e($file->details()),
        );
    }
}
