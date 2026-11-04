<?php

namespace App\Media;

use App\Models\Article;
use App\Models\MediaFile;
use App\Models\MediaUsage;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Throwable;

/**
 * Thư viện ảnh / file trên ổ public: ghi nhận file (kể cả file do form bài viết tự lưu)
 * và chỗ đang dùng từng file, để admin biết file nào xóa được.
 */
class MediaLibrary
{
    /** Thư mục trên ổ public không đưa vào thư viện */
    private const IGNORED_PREFIXES = ['livewire-tmp/', '.'];

    /**
     * Ghi nhận một file đã có trên ổ (gọi lại nhiều lần không tạo trùng).
     */
    public function register(string $path, ?string $originalName = null, ?int $uploadedBy = null): ?MediaFile
    {
        $path = ltrim($path, '/');
        $disk = Storage::disk(MediaFile::DISK);
        if ($path === '' || ! $disk->exists($path)) {
            return null;
        }

        $existing = MediaFile::query()->where('path', $path)->first();
        if ($existing !== null) {
            return $existing;
        }

        $mimeType = $disk->mimeType($path) ?: null;
        [$width, $height] = $this->imageSize($disk->path($path), $mimeType);

        return MediaFile::query()->create([
            'path' => $path,
            'folder' => $this->folderOf($path),
            'name' => Str::limit(pathinfo($originalName ?? $path, PATHINFO_FILENAME), 250, ''),
            'mime_type' => $mimeType,
            'size' => $disk->size($path),
            'width' => $width,
            'height' => $height,
            'uploaded_by' => $uploadedBy,
        ]);
    }

    /**
     * Ghi lại file mà bài viết đang dùng (ảnh bìa + ảnh chèn trong nội dung).
     */
    public function syncArticle(Article $article): void
    {
        $this->syncUsages($article, [
            'cover_image' => array_filter([$article->cover_image]),
            'content' => $this->imagePathsInHtml((string) $article->content),
        ]);
    }

    public function forgetUsagesOf(Model $usable): void
    {
        MediaUsage::query()->whereMorphedTo('usable', $usable)->delete();
    }

    /**
     * Quét ổ public: thêm file chưa có trong thư viện, bỏ bản ghi của file đã mất, tính lại chỗ dùng.
     *
     * @return array{added: int, removed: int, total: int}
     */
    public function syncFromDisk(): array
    {
        $disk = Storage::disk(MediaFile::DISK);
        $before = MediaFile::query()->count();

        $missing = MediaFile::query()->get()->reject(fn (MediaFile $file): bool => $disk->exists($file->path));
        MediaFile::query()->whereKey($missing->modelKeys())->delete();

        foreach ($disk->allFiles() as $path) {
            if (! Str::startsWith($path, self::IGNORED_PREFIXES) && ! str_starts_with(basename($path), '.')) {
                $this->register($path);
            }
        }

        Article::query()->each(fn (Article $article) => $this->syncArticle($article));

        $total = MediaFile::query()->count();

        return ['added' => $total - $before + $missing->count(), 'removed' => $missing->count(), 'total' => $total];
    }

    /**
     * @return list<string> đường dẫn (data-id) các ảnh chèn trong HTML của RichEditor
     */
    public function imagePathsInHtml(string $html): array
    {
        preg_match_all('#<img\b[^>]*\bdata-id="([^"]+)"#i', $html, $matches);

        return array_values(array_unique(array_map(html_entity_decode(...), $matches[1])));
    }

    /**
     * @param  array<string, list<string>>  $pathsByField
     */
    private function syncUsages(Model $usable, array $pathsByField): void
    {
        $keep = [];
        foreach ($pathsByField as $field => $paths) {
            foreach ($paths as $path) {
                $file = $this->register($path);
                if ($file === null) {
                    continue;
                }

                $usage = MediaUsage::query()->firstOrCreate([
                    'media_file_id' => $file->id,
                    'usable_type' => $usable->getMorphClass(),
                    'usable_id' => $usable->getKey(),
                    'field' => $field,
                ]);
                $keep[] = $usage->id;
            }
        }

        MediaUsage::query()->whereMorphedTo('usable', $usable)->whereKeyNot($keep)->delete();
    }

    private function folderOf(string $path): string
    {
        foreach (array_keys(MediaFile::FOLDERS) as $folder) {
            if (str_starts_with($path, $folder.'/')) {
                return $folder;
            }
        }

        $directory = dirname($path);

        return $directory === '.' ? '/' : $directory;
    }

    /**
     * @return array{0: ?int, 1: ?int}
     */
    private function imageSize(string $absolutePath, ?string $mimeType): array
    {
        if (! str_starts_with((string) $mimeType, 'image/') || $mimeType === 'image/svg+xml') {
            return [null, null];
        }

        try {
            $size = getimagesize($absolutePath);
        } catch (Throwable) {
            return [null, null];
        }

        return $size === false ? [null, null] : [$size[0], $size[1]];
    }
}
