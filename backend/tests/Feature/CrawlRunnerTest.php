<?php

namespace Tests\Feature;

use App\Crawling\Adapters\ParsedPage;
use App\Crawling\Adapters\PriceRow;
use App\Crawling\CrawlRunner;
use App\Crawling\PriceImporter;
use App\Enums\CrawlStatus;
use App\Enums\PriceStatus;
use App\Models\CrawlLog;
use App\Models\Price;
use App\Models\PriceSource;
use App\Models\Product;
use App\Models\Region;
use Carbon\CarbonImmutable;
use Database\Seeders\CatalogSeeder;
use Database\Seeders\PriceSourceSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;
use Tests\TestCase;

class CrawlRunnerTest extends TestCase
{
    use RefreshDatabase;

    private PriceSource $pepper;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed([CatalogSeeder::class, PriceSourceSeeder::class]);
        $this->pepper = PriceSource::query()->where('code', 'vietbao-ho-tieu')->firstOrFail();

        Sleep::fake();
        Http::preventStrayRequests();
    }

    public function test_run_finds_todays_article_and_saves_prices(): void
    {
        $this->fakeVietbao();

        $status = $this->crawlPepper('2026-10-14');

        $this->assertSame(CrawlStatus::Success, $status);
        $this->assertSame(5, Price::query()->published()->count());
        $this->assertDatabaseHas('prices', [
            'product_id' => $this->productId('ho-tieu'),
            'region_id' => $this->regionId('dak-nong'),
            'date' => '2026-10-14',
            'price_avg' => 140000,
            'unit' => 'kg',
        ]);

        $log = CrawlLog::query()->sole();
        $this->assertSame(CrawlStatus::Success, $log->status);
        $this->assertSame(5, $log->items_count);
        $this->assertStringContainsString('gia-ho-tieu-hom-nay-1410', $log->url);
        $this->assertNotEmpty($log->raw_html);
        $this->assertSame(CrawlStatus::Success, $this->pepper->refresh()->last_status);
    }

    public function test_running_twice_does_not_duplicate_prices(): void
    {
        $this->fakeVietbao();

        $this->assertSame(CrawlStatus::Success, $this->crawlPepper('2026-10-14'));
        $this->assertSame(CrawlStatus::Success, $this->crawlPepper('2026-10-14'));

        $this->assertSame(5, Price::query()->count());
    }

    public function test_large_jump_from_previous_price_needs_review(): void
    {
        $this->fakeVietbao();
        Price::factory()->create([
            'product_id' => $this->productId('ho-tieu'),
            'region_id' => $this->regionId('gia-lai'),
            'date' => '2026-10-13',
            'price_avg' => 100000,
        ]);

        $this->crawlPepper('2026-10-14');

        $todayGiaLai = Price::query()
            ->where('region_id', $this->regionId('gia-lai'))
            ->where('date', '2026-10-14')
            ->sole();
        $this->assertSame(PriceStatus::NeedsReview, $todayGiaLai->status);
        $this->assertSame(4, Price::query()->where('date', '2026-10-14')->published()->count());
    }

    public function test_genuine_jump_flags_only_the_first_day_not_every_day_after(): void
    {
        $importer = app(PriceImporter::class);
        $pepper = $this->productId('ho-tieu');
        $giaLai = $this->regionId('gia-lai');
        $page = fn (int $price) => new ParsedPage([new PriceRow($pepper, $giaLai, $price, $price, $price, 'kg')], [], null);
        $status = fn (string $date) => Price::query()->where('region_id', $giaLai)->where('date', $date)->sole()->status;

        $importer->import($this->pepper, CarbonImmutable::parse('2026-10-10'), 'u', $page(100000));
        $importer->import($this->pepper, CarbonImmutable::parse('2026-10-11'), 'u', $page(140000));
        $importer->import($this->pepper, CarbonImmutable::parse('2026-10-12'), 'u', $page(141000));

        $this->assertSame([PriceStatus::Published, PriceStatus::NeedsReview, PriceStatus::Published], [$status('2026-10-10'), $status('2026-10-11'), $status('2026-10-12')]);
    }

    public function test_rejected_price_is_not_overwritten(): void
    {
        $this->fakeVietbao();
        $rejected = Price::factory()->create([
            'product_id' => $this->productId('ho-tieu'),
            'region_id' => $this->regionId('gia-lai'),
            'price_source_id' => $this->pepper->id,
            'date' => '2026-10-14',
            'price_avg' => 1,
            'status' => PriceStatus::Rejected,
        ]);

        $this->crawlPepper('2026-10-14');

        $this->assertSame(PriceStatus::Rejected, $rejected->refresh()->status);
        $this->assertSame(1, $rejected->price_avg);
    }

    public function test_robots_txt_disallow_is_respected(): void
    {
        $this->fakeVietbao(robots: "User-agent: *\nDisallow: /gia-ho-tieu-");

        $status = $this->crawlPepper('2026-10-14');

        $this->assertSame(CrawlStatus::Failed, $status);
        $this->assertSame(0, Price::query()->count());
        $this->assertStringContainsString('robots.txt', CrawlLog::query()->sole()->message);
        Http::assertNotSent(fn ($request) => str_contains($request->url(), 'gia-ho-tieu-hom-nay'));
    }

    public function test_article_published_on_another_day_is_skipped(): void
    {
        $this->fakeVietbao();

        $status = $this->crawlPepper('2026-10-15');

        $this->assertSame(CrawlStatus::Skipped, $status);
        $this->assertSame(0, Price::query()->count());
    }

    public function test_no_article_in_sitemap_is_skipped(): void
    {
        $this->fakeVietbao(sitemap: '<urlset></urlset>');

        $this->assertSame(CrawlStatus::Skipped, $this->crawlPepper('2026-10-14'));
        $this->assertSame('Không tìm thấy bài giá cho ngày này.', CrawlLog::query()->sole()->message);
    }

    public function test_fixed_price_page_is_stored_under_its_update_date(): void
    {
        Http::fake([
            'vinacam.com.vn/robots.txt' => Http::response("User-agent: *\nDisallow: /*.php"),
            'vinacam.com.vn/bang-gia-phan-bon' => Http::response(file_get_contents(base_path('tests/Fixtures/crawl/vinacam-phan-bon-2026-10-02.html'))),
        ]);
        $source = PriceSource::query()->where('code', 'vinacam-phan-bon-si')->firstOrFail();

        $status = app(CrawlRunner::class)->run($source, CarbonImmutable::parse('2026-10-14'));

        $this->assertSame(CrawlStatus::Success, $status);
        $this->assertSame(12, Price::query()->where('date', '2026-10-02')->count());
        $this->assertStringContainsString('ngày cập nhật 02/10/2026', CrawlLog::query()->sole()->message);
    }

    public function test_reparse_uses_stored_html_without_fetching(): void
    {
        $this->fakeVietbao();
        $this->crawlPepper('2026-10-14');
        Price::query()->delete();
        Http::fake(fn () => throw new \RuntimeException('Không được tải lại'));

        $log = app(CrawlRunner::class)->reparse(CrawlLog::query()->sole());

        $this->assertSame(CrawlStatus::Success, $log->status);
        $this->assertSame(5, Price::query()->count());
    }

    private function crawlPepper(string $date): CrawlStatus
    {
        return app(CrawlRunner::class)->run($this->pepper, CarbonImmutable::parse($date));
    }

    private function fakeVietbao(string $robots = "User-agent: *\nDisallow: /print-*.html", ?string $sitemap = null): void
    {
        $fixtures = base_path('tests/Fixtures/crawl/');

        Http::fake([
            'vietbao.vn/robots.txt' => Http::response($robots),
            'vietbao.vn/sitemap/*' => Http::response($sitemap ?? file_get_contents($fixtures.'vietbao-sitemap-2026-10-14.xml')),
            'vietbao.vn/gia-ho-tieu-hom-nay-*' => Http::response(file_get_contents($fixtures.'vietbao-ho-tieu-2026-10-14.html')),
        ]);
    }

    private function productId(string $code): int
    {
        return Product::query()->where('code', $code)->value('id');
    }

    private function regionId(string $code): int
    {
        return Region::query()->where('code', $code)->value('id');
    }
}
