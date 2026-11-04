<?php

namespace Tests\Feature;

use App\Enums\ArticleStatus;
use App\Filament\Resources\Articles\Pages\CreateArticle;
use App\Models\Article;
use App\Models\ArticleCategory;
use App\Models\Product;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Livewire\Livewire;
use Tests\TestCase;

class ArticleApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_list_shows_only_published_articles_of_active_categories_newest_first(): void
    {
        $category = ArticleCategory::factory()->create();
        $older = Article::factory()->for($category, 'category')->create(['published_at' => now()->subDays(3)]);
        $newer = Article::factory()->for($category, 'category')->create(['published_at' => now()->subHour()]);
        Article::factory()->for($category, 'category')->draft()->create();
        Article::factory()->for($category, 'category')->scheduled()->create();
        Article::factory()->for(ArticleCategory::factory()->create(['is_active' => false]), 'category')->create();

        $response = $this->getJson('/api/v1/articles')->assertOk();

        $this->assertSame([$newer->slug, $older->slug], array_column($response->json('data'), 'slug'));
        $this->assertSame(2, $response->json('meta.total'));
        $this->assertArrayNotHasKey('content_html', $response->json('data.0'));
    }

    public function test_list_filters_by_category_product_keyword_and_featured(): void
    {
        $pests = ArticleCategory::factory()->create(['slug' => 'sau-benh']);
        $pepper = Product::factory()->create(['code' => 'ho-tieu']);
        $pestArticle = Article::factory()->for($pests, 'category')->create(['title' => 'Phòng bệnh chết nhanh']);
        $pestArticle->products()->attach($pepper);
        $featured = Article::factory()->create(['title' => 'Giá cà phê tuần này', 'is_featured' => true]);

        $this->assertSame([$pestArticle->slug], array_column($this->getJson('/api/v1/articles?category=sau-benh')->json('data'), 'slug'));
        $this->assertSame([$pestArticle->slug], array_column($this->getJson('/api/v1/articles?product=ho-tieu')->json('data'), 'slug'));
        $this->assertSame([$pestArticle->slug], array_column($this->getJson('/api/v1/articles?q='.urlencode('chết nhanh'))->json('data'), 'slug'));
        $this->assertSame([$featured->slug], array_column($this->getJson('/api/v1/articles?featured=1')->json('data'), 'slug'));
    }

    public function test_categories_count_only_published_articles(): void
    {
        $category = ArticleCategory::factory()->create(['sort' => 1]);
        Article::factory()->for($category, 'category')->count(2)->create();
        Article::factory()->for($category, 'category')->draft()->create();
        ArticleCategory::factory()->create(['is_active' => false]);

        $response = $this->getJson('/api/v1/article-categories')->assertOk();

        $this->assertCount(1, $response->json('data'));
        $this->assertSame(2, $response->json('data.0.articles_count'));
    }

    public function test_show_returns_sanitized_content_counts_view_and_lists_related(): void
    {
        $category = ArticleCategory::factory()->create();
        $article = Article::factory()->for($category, 'category')->create([
            'content' => '<p>Bón phân <strong>đúng lúc</strong></p><script>alert(1)</script><img src="x" onerror="alert(2)">',
        ]);
        $related = Article::factory()->for($category, 'category')->create();
        Article::factory()->create();

        $response = $this->getJson("/api/v1/articles/{$article->slug}")->assertOk();

        $html = $response->json('data.content_html');
        $this->assertStringContainsString('<strong>đúng lúc</strong>', $html);
        $this->assertStringNotContainsString('<script', $html);
        $this->assertStringNotContainsString('onerror', $html);
        $this->assertSame(1, $response->json('data.views'));
        $this->assertSame([$related->slug], array_column($response->json('related'), 'slug'));
        $this->assertSame(1, $article->refresh()->views);
    }

    public function test_draft_and_scheduled_articles_are_not_found(): void
    {
        $draft = Article::factory()->draft()->create();
        $scheduled = Article::factory()->scheduled()->create();

        $this->getJson("/api/v1/articles/{$draft->slug}")->assertNotFound();
        $this->getJson("/api/v1/articles/{$scheduled->slug}")->assertNotFound();
        $this->assertSame(0, $draft->refresh()->views);
    }

    public function test_cover_url_uses_the_host_the_client_called(): void
    {
        $article = Article::factory()->create(['cover_image' => 'articles/covers/a.jpg']);

        $response = $this->getJson("http://192.168.1.7:5174/api/v1/articles/{$article->slug}")->assertOk();

        $this->assertSame('http://192.168.1.7:5174/storage/articles/covers/a.jpg', $response->json('data.cover_url'));
    }

    public function test_admin_publishes_article_without_date_and_it_gets_published_now(): void
    {
        $this->seed(DatabaseSeeder::class);
        $admin = User::factory()->create();
        $admin->forceFill(['is_admin' => true])->save();
        $category = ArticleCategory::query()->where('slug', 'sau-benh')->firstOrFail();

        $this->actingAs($admin)->get('/admin/articles')->assertOk();
        $this->get('/admin/article-categories')->assertOk();

        Livewire::test(CreateArticle::class)
            ->fillForm([
                'title' => 'Phòng rầy nâu trên lúa',
                'slug' => 'phong-ray-nau-tren-lua',
                'article_category_id' => $category->id,
                'content' => '<p>Thăm đồng thường xuyên.</p>',
                'status' => ArticleStatus::Published->value,
            ])
            ->call('create')
            ->assertHasNoFormErrors();

        $article = Article::query()->where('slug', 'phong-ray-nau-tren-lua')->sole();
        $this->assertTrue($article->isPublished());
        $this->getJson('/api/v1/articles/phong-ray-nau-tren-lua')->assertOk();
    }
}
