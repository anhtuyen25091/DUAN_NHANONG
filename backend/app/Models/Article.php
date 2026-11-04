<?php

namespace App\Models;

use App\Enums\ArticleStatus;
use App\Media\MediaLibrary;
use Database\Factories\ArticleFactory;
use Filament\Forms\Components\RichEditor\RichContentRenderer;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;

/**
 * Bài viết do admin soạn trong /admin, hiện ở mục "Bài viết" của web / app.
 * Nội dung là HTML của RichEditor; khi trả ra ngoài luôn qua contentHtml() (đã lọc XSS).
 */
#[Fillable(['article_category_id', 'title', 'slug', 'excerpt', 'cover_image', 'content', 'status', 'published_at', 'is_featured', 'source_name', 'source_url'])]
class Article extends Model
{
    /** @use HasFactory<ArticleFactory> */
    use HasFactory;

    /** Ổ lưu ảnh bìa + ảnh chèn trong bài */
    public const DISK = 'public';

    /** Ghi lại ảnh bìa / ảnh trong bài vào Thư viện ảnh để biết file nào đang dùng */
    protected static function booted(): void
    {
        static::saved(function (Article $article): void {
            if ($article->wasRecentlyCreated || $article->wasChanged(['cover_image', 'content'])) {
                app(MediaLibrary::class)->syncArticle($article);
            }
        });
        static::deleted(fn (Article $article) => app(MediaLibrary::class)->forgetUsagesOf($article));
    }

    protected function casts(): array
    {
        return [
            'status' => ArticleStatus::class,
            'published_at' => 'datetime',
            'is_featured' => 'boolean',
            'views' => 'integer',
        ];
    }

    /**
     * @return BelongsTo<ArticleCategory, $this>
     */
    public function category(): BelongsTo
    {
        return $this->belongsTo(ArticleCategory::class, 'article_category_id');
    }

    /**
     * @return BelongsToMany<Product, $this>
     */
    public function products(): BelongsToMany
    {
        return $this->belongsToMany(Product::class);
    }

    /**
     * @return MorphMany<MediaUsage, $this>
     */
    public function mediaUsages(): MorphMany
    {
        return $this->morphMany(MediaUsage::class, 'usable');
    }

    /**
     * Đã đăng và tới giờ đăng (đặt ngày đăng trong tương lai = hẹn giờ), danh mục đang bật.
     *
     * @param  Builder<Article>  $query
     */
    public function scopePublished(Builder $query): void
    {
        $query->where('status', ArticleStatus::Published)
            ->whereNotNull('published_at')
            ->where('published_at', '<=', now())
            ->whereHas('category', fn (Builder $category) => $category->where('is_active', true));
    }

    public function isPublished(): bool
    {
        return $this->status === ArticleStatus::Published && $this->published_at !== null && $this->published_at->lessThanOrEqualTo(now());
    }

    /** HTML nội dung đã lọc (Symfony HtmlSanitizer), ảnh chèn trong bài có URL đầy đủ */
    public function contentHtml(): string
    {
        if (blank($this->content)) {
            return '';
        }

        return RichContentRenderer::make($this->content)
            ->fileAttachmentsDisk(self::DISK)
            ->fileAttachmentsVisibility('public')
            ->toHtml();
    }
}
