<?php

namespace Tests\Feature;

use App\Enums\CrawlStatus;
use App\Models\CrawlLog;
use App\Models\Price;
use App\Models\Product;
use App\Models\Region;
use Database\Seeders\CatalogSeeder;
use Database\Seeders\PriceSourceSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;
use Tests\TestCase;

/**
 * Lấy dữ liệu giá cũ theo tháng từ sitemap tháng của báo (php artisan crawl:backfill).
 */
class BackfillPricesTest extends TestCase
{
    use RefreshDatabase;

    private const ARTICLE = 'https://baoquocte.vn/gia-ca-phe-hom-nay-1511-gia-tiep-tuc-164877.html';

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed([CatalogSeeder::class, PriceSourceSeeder::class]);
        Sleep::fake();
        Http::preventStrayRequests();

        $sitemap = '<urlset><url><loc>'.self::ARTICLE.'</loc></url>'
            .'<url><loc>https://baoquocte.vn/gia-tieu-hom-nay-1511-164804.html</loc></url>'
            .'<url><loc>https://baoquocte.vn/tin-the-gioi-khac-1.html</loc></url></urlset>';

        Http::fake([
            'baoquocte.vn/robots.txt' => Http::response("User-agent: *\nDisallow: /article/"),
            // Tháng 11/2021 dùng mẫu có số 0 (2021-11); mẫu thứ 2 không cần tới
            'baoquocte.vn/stores/lookssitemaps/site_1/sitemap-month-2021-11.xml' => Http::response($sitemap),
            'baoquocte.vn/gia-ca-phe-hom-nay-*' => Http::response(file_get_contents(base_path('tests/Fixtures/crawl/baoquocte-ca-phe-2021-11-15.html'))),
        ]);
    }

    public function test_backfill_month_saves_prices_on_the_article_date(): void
    {
        $this->artisan('crawl:backfill', ['sources' => ['baoquocte-ca-phe'], '--from' => '2021-11', '--to' => '2021-11'])
            ->expectsOutputToContain('1 bài,   0 đã có, lưu    4 giá, 0 lỗi')
            ->assertSuccessful();

        $this->assertDatabaseHas('prices', [
            'product_id' => Product::query()->where('code', 'ca-phe-robusta')->value('id'),
            'region_id' => Region::query()->where('code', 'dak-lak')->value('id'),
            'date' => '2021-11-15',
            'price_avg' => 41300,
        ]);
        $log = CrawlLog::query()->sole();
        $this->assertSame(CrawlStatus::Success, $log->status);
        $this->assertSame('2021-11-15', substr((string) $log->target_date, 0, 10));
        $this->assertNull($log->raw_html, 'Mặc định không lưu HTML để đỡ tốn dung lượng');
    }

    public function test_running_again_skips_articles_already_done(): void
    {
        $this->artisan('crawl:backfill', ['sources' => ['baoquocte-ca-phe'], '--from' => '2021-11', '--to' => '2021-11'])->assertSuccessful();
        $this->artisan('crawl:backfill', ['sources' => ['baoquocte-ca-phe'], '--from' => '2021-11', '--to' => '2021-11'])
            ->expectsOutputToContain('1 bài,   1 đã có, lưu    0 giá')
            ->assertSuccessful();

        Http::assertSentCount(4); // robots + sitemap + bài (lần 1) + sitemap (lần 2)
        $this->assertSame(4, Price::query()->count());
    }
}
