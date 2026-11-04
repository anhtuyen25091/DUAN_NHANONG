<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\ArticleCategoryResource;
use App\Http\Resources\ArticleResource;
use App\Models\Article;
use App\Models\ArticleCategory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Bài viết do admin soạn: danh mục, danh sách (lọc danh mục / mặt hàng / từ khóa), đọc bài.
 */
class ArticleController extends Controller
{
    public const PER_PAGE = 12;

    public const RELATED = 4;

    public function categories(): AnonymousResourceCollection
    {
        $categories = ArticleCategory::query()
            ->active()
            ->withCount(['articles' => fn (Builder $query) => $query->published()])
            ->get();

        return ArticleCategoryResource::collection($categories);
    }

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'category' => ['nullable', 'string', 'max:100'],
            'product' => ['nullable', 'string', 'max:100'],
            'q' => ['nullable', 'string', 'max:100'],
            'featured' => ['nullable', 'boolean'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:30'],
        ]);

        $query = Article::query()
            ->published()
            ->with('category')
            ->when($data['category'] ?? null, fn (Builder $q, string $slug) => $q->whereHas('category', fn (Builder $c) => $c->where('slug', $slug)))
            ->when($data['product'] ?? null, fn (Builder $q, string $code) => $q->whereHas('products', fn (Builder $p) => $p->where('code', $code)))
            ->when($request->boolean('featured'), fn (Builder $q) => $q->where('is_featured', true))
            ->when($data['q'] ?? null, function (Builder $q, string $term): void {
                $like = '%'.addcslashes($term, '%_\\').'%';
                $q->where(fn (Builder $w) => $w->where('title', 'like', $like)->orWhere('excerpt', 'like', $like));
            })
            ->orderByDesc('published_at')
            ->orderByDesc('id');

        $page = (int) ($data['page'] ?? 1);
        $paginator = $query->paginate((int) ($data['per_page'] ?? self::PER_PAGE), page: $page);

        return response()->json([
            'data' => ArticleResource::collection($paginator->getCollection())->resolve($request),
            'meta' => ['page' => $page, 'has_more' => $paginator->hasMorePages(), 'total' => $paginator->total()],
        ]);
    }

    public function show(Request $request, string $slug): JsonResponse
    {
        $article = Article::query()->published()->with(['category', 'products'])->where('slug', $slug)->firstOrFail();
        $article->increment('views');

        $related = Article::query()
            ->published()
            ->with('category')
            ->where('article_category_id', $article->article_category_id)
            ->whereKeyNot($article->id)
            ->orderByDesc('published_at')
            ->limit(self::RELATED)
            ->get();

        return response()->json([
            'data' => (new ArticleResource($article))->withContent()->resolve($request),
            'related' => ArticleResource::collection($related)->resolve($request),
        ]);
    }
}
