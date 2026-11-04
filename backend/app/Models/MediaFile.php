<?php

namespace App\Models;

use Database\Factories\MediaFileFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Number;

/**
 * Một file trong thư viện (ổ public): ảnh / tài liệu tải lên để dùng ngoài (link công khai),
 * ảnh bìa và ảnh chèn trong bài viết. Chỗ đang dùng ghi ở media_usages (App\Media\MediaLibrary).
 * Xóa bản ghi thì xóa luôn file trên ổ.
 */
#[Fillable(['path', 'folder', 'name', 'alt', 'mime_type', 'size', 'width', 'height', 'uploaded_by'])]
class MediaFile extends Model
{
    /** @use HasFactory<MediaFileFactory> */
    use HasFactory;

    public const DISK = 'public';

    /** Thư mục file tải lên trực tiếp vào thư viện */
    public const LIBRARY_FOLDER = 'thu-vien';

    /** @var array<string, string> thư mục => tên hiện trong admin */
    public const FOLDERS = [
        self::LIBRARY_FOLDER => 'Thư viện (tải lên)',
        'articles/covers' => 'Ảnh bìa bài viết',
        'articles/content' => 'Ảnh trong bài viết',
    ];

    protected static function booted(): void
    {
        static::deleted(function (MediaFile $file): void {
            Storage::disk(self::DISK)->delete($file->path);
        });
    }

    protected function casts(): array
    {
        return [
            'size' => 'integer',
            'width' => 'integer',
            'height' => 'integer',
        ];
    }

    /**
     * @return HasMany<MediaUsage, $this>
     */
    public function usages(): HasMany
    {
        return $this->hasMany(MediaUsage::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    /**
     * @param  Builder<MediaFile>  $query
     */
    public function scopeImages(Builder $query): void
    {
        $query->where('mime_type', 'like', 'image/%');
    }

    /**
     * @param  Builder<MediaFile>  $query
     */
    public function scopeUnused(Builder $query): void
    {
        $query->whereDoesntHave('usages');
    }

    public function isImage(): bool
    {
        return str_starts_with((string) $this->mime_type, 'image/');
    }

    /**
     * Link công khai để dùng ngoài (dán vào web khác, Zalo, Facebook…), theo địa chỉ đang mở admin
     * (máy dev mở qua IP mạng LAN vẫn đúng); chạy lệnh / hàng đợi thì theo APP_URL.
     */
    public function url(): string
    {
        if (config('filesystems.disks.'.self::DISK.'.driver') === 'local') {
            return url('storage/'.$this->path);
        }

        return Storage::disk(self::DISK)->url($this->path);
    }

    public function folderLabel(): string
    {
        return self::FOLDERS[$this->folder] ?? $this->folder;
    }

    /** "1,2 MB · 1200×800" */
    public function details(): string
    {
        return collect([
            Number::fileSize($this->size, precision: 1),
            $this->width && $this->height ? "{$this->width}×{$this->height}" : null,
        ])->filter()->implode(' · ');
    }
}
