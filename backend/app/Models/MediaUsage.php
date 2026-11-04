<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * File thư viện đang được dùng ở đâu (vd ảnh bìa / ảnh trong nội dung của một bài viết).
 */
#[Fillable(['media_file_id', 'usable_type', 'usable_id', 'field'])]
class MediaUsage extends Model
{
    /** @var array<string, string> */
    public const FIELDS = [
        'cover_image' => 'ảnh bìa',
        'content' => 'trong nội dung',
    ];

    /**
     * @return BelongsTo<MediaFile, $this>
     */
    public function mediaFile(): BelongsTo
    {
        return $this->belongsTo(MediaFile::class);
    }

    /**
     * @return MorphTo<Model, $this>
     */
    public function usable(): MorphTo
    {
        return $this->morphTo();
    }

    public function fieldLabel(): string
    {
        return self::FIELDS[$this->field] ?? $this->field;
    }
}
