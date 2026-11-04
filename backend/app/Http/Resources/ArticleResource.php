<?php

namespace App\Http\Resources;

use App\Models\Article;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Bài viết; nội dung đầy đủ (content_html) chỉ có khi gọi withContent().
 *
 * @mixin Article
 */
class ArticleResource extends JsonResource
{
    private bool $withContent = false;

    public function withContent(): static
    {
        $this->withContent = true;

        return $this;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'slug' => $this->slug,
            'title' => $this->title,
            'excerpt' => $this->excerpt,
            'cover_url' => $this->cover_image ? self::publicUrl($request, Storage::disk(Article::DISK)->url($this->cover_image)) : null,
            'category' => new ArticleCategoryResource($this->whenLoaded('category')),
            'published_at' => $this->published_at?->toIso8601String(),
            'is_featured' => $this->is_featured,
            'views' => $this->views,
            $this->mergeWhen($this->withContent, fn (): array => [
                'content_html' => self::publicUrl($request, $this->contentHtml()),
                'source_name' => $this->source_name,
                'source_url' => $this->source_url,
                'products' => ProductResource::collection($this->whenLoaded('products')),
            ]),
        ];
    }

    /**
     * Đổi URL ảnh (APP_URL/storage/…) sang đúng tên miền người dùng đang gọi: điện thoại trong mạng LAN / qua proxy
     * của Vite không mở được "localhost".
     */
    public static function publicUrl(Request $request, string $text): string
    {
        $diskUrl = rtrim((string) config('filesystems.disks.'.Article::DISK.'.url'), '/');
        if ($diskUrl === '' || ! Str::contains($text, $diskUrl)) {
            return $text;
        }

        return str_replace($diskUrl, $request->getSchemeAndHttpHost().'/storage', $text);
    }
}
