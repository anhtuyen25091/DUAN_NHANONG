<?php

namespace Tests\Feature;

use App\Crawling\Adapters\DurianArticleAdapter;
use App\Crawling\Adapters\SitemapArticleAdapter;
use App\Models\Price;
use App\Models\PriceSource;
use App\Models\Product;
use App\Models\Region;
use Database\Seeders\CatalogSeeder;
use Database\Seeders\PriceSourceSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;
use Tests\TestCase;

/**
 * Dữ liệu cũ từ báo: giá lúa gạo Báo Công Thương (sitemap theo tuần) và giá sầu riêng Thương hiệu & Công luận (trang tag).
 */
class NewsArchiveBackfillTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed([CatalogSeeder::class, PriceSourceSeeder::class]);
        Sleep::fake();
        Http::preventStrayRequests();
    }

    public function test_weekly_sitemaps_of_the_month_are_all_read(): void
    {
        $sitemap = fn (string ...$urls): string => '<urlset>'.implode('', array_map(fn (string $url): string => "<url><loc>{$url}</loc></url>", $urls)).'</urlset>';

        Http::fake([
            'congthuong.vn/robots.txt' => Http::response("User-agent: *\nAllow: /"),
            'congthuong.vn/sitemap-article-2021-11-1.xml' => Http::response($sitemap('https://congthuong.vn/tin-khac-1.html')),
            'congthuong.vn/sitemap-article-2021-11-2.xml' => Http::response($sitemap(
                'https://congthuong.vn/gia-lua-gao-hom-nay-911-gia-lua-tang-200-dongkg-167035.html',
                'https://congthuong.vn/tin-khac-2.html',
            )),
            'congthuong.vn/sitemap-article-2021-11-3.xml' => Http::response($sitemap('https://congthuong.vn/gia-lua-gao-hom-nay-1711-gia-lua-di-ngang-gia-gao-giam-167481.html')),
            'congthuong.vn/sitemap-article-2021-11-*.xml' => Http::response('Not found', 404),
            'congthuong.vn/gia-lua-gao-hom-nay-911-*' => Http::response($this->fixture('congthuong-lua-gao-2021-11-09.html')),
            'congthuong.vn/gia-lua-gao-hom-nay-1711-*' => Http::response($this->fixture('congthuong-lua-gao-2021-11-17.html')),
        ]);

        $this->artisan('crawl:backfill', ['sources' => ['congthuong-lua-gao'], '--from' => '2021-11', '--to' => '2021-11'])
            ->expectsOutputToContain('2 bài,   0 đã có, lưu   12 giá, 0 lỗi')
            ->assertSuccessful();

        $this->assertSame(5750, $this->price('lua-ir-50404', 'an-giang', '2021-11-09'));
        $this->assertSame(8325, $this->price('gao-ir-504', 'an-giang', '2021-11-09'));
        // "Lúa IR 50404 (khô) 6.500 đồng/kg" đứng trước giá lúa tươi trong bài: bỏ, lấy giá lúa tươi
        $this->assertSame(5500, $this->price('lua-ir-50404', 'an-giang', '2021-11-17'));
        Http::assertSentCount(8); // robots + 5 sitemap tuần (tuần 4, 5 trả 404) + 2 bài
    }

    public function test_rice_articles_tell_paddy_from_rice_and_skip_by_products(): void
    {
        $this->assertSame([
            'lua-dai-thom-8' => 6400,
            'lua-om-18' => 5900,
            'lua-ir-50404' => 5750,
            'lua-om-5451' => 5900,
            'lua-om-380' => 5350,
            'gao-ir-504' => 8325,
        ], $this->riceAvg('congthuong-lua-gao-2021-11-09.html'));

        // Bảng ghi "IR 504" ở phần lúa (= lúa IR 50404) rồi "Gạo nguyên liệu IR 504": phân biệt theo chữ đứng trước
        $rice2023 = $this->riceAvg('congthuong-lua-gao-2023-01-19.html');
        $this->assertSame(6250, $rice2023['lua-ir-50404']);
        $this->assertSame(9300, $rice2023['gao-ir-504']);

        // "tấm OM 5451 ở mức 8.600 - 8.800" là phụ phẩm, không phải gạo OM 5451
        $rice2024 = $this->riceAvg('congthuong-lua-gao-2024-09-14.html');
        $this->assertArrayNotHasKey('gao-om-5451', $rice2024);
        $this->assertSame(10675, $rice2024['gao-ir-504']);
        $this->assertSame(7700, $rice2024['lua-om-380']);

        $this->assertCount(11, $this->riceAvg('congthuong-lua-gao-2026-10-14.html'));
    }

    public function test_rice_price_lower_than_paddy_in_the_same_article_is_dropped(): void
    {
        $html = '<div class="edittor-content"><p>Giá lúa tươi: Đài Thơm 8 ở mức 7.800 - 8.000 đồng/kg.</p>'
            .'<p>Giá gạo xuất khẩu: OM 18 ở mức 7.200 - 7.400 đồng/kg; IR 504 ở mức 10.700 đồng/kg.</p></div>';

        // "OM 18" sau chữ "gạo xuất khẩu" nhưng giá ngang giá lúa => gán nhầm, bỏ
        $this->assertSame(['lua-dai-thom-8' => 7900, 'gao-ir-504' => 10700], $this->riceAvg(html: $html));
    }

    public function test_durian_tables_by_region_keep_grade_a_only(): void
    {
        $prices = $this->durian('thcl-sau-rieng-2025-06-27.html');

        // Câu mở bài nhắc cả 3 vùng thì không gán; bảng ĐBSCL: Thái loại 1 (không lấy VIP), Ri6 loại 1
        $this->assertSame([75000, 78000], $prices['sau-rieng-thai|dbscl']);
        $this->assertSame([45000, 46000], $prices['sau-rieng-ri6|dbscl']);
        // Đông Nam Bộ chỉ có bảng theo tỉnh: lấy tỉnh đầu tiên (Đồng Nai) cho cả vùng
        $this->assertSame([80000, 82000], $prices['sau-rieng-thai|dong-nam-bo']);
        $this->assertSame([80000, 82000], $prices['sau-rieng-thai|dong-nai']);
        $this->assertSame([40000, 42000], $prices['sau-rieng-ri6|tay-nguyen']);
        $this->assertSame([78000, 80000], $prices['sau-rieng-thai|dak-lak']);
        $this->assertCount(14, $prices);
    }

    public function test_durian_sentences_in_other_layouts(): void
    {
        // "Ri6 A ở mức …", "Thái A có giá …"; bỏ "Thái đống loại A"
        $this->assertSame([
            'sau-rieng-ri6|dbscl' => [62000, 65000],
            'sau-rieng-thai|dbscl' => [74000, 77000],
        ], $this->durian('thcl-sau-rieng-2025-02-14.html'));

        // Mục "Đối với sầu Thái:" / "Đối với sầu riêng Ri6:": bỏ "Thái VIP loại A", lấy "Thái mẫu thường loại A"
        $this->assertSame([
            'sau-rieng-thai|dbscl' => [162000, 165000],
            'sau-rieng-ri6|dbscl' => [100000, 108000],
        ], $this->durian('thcl-sau-rieng-2026-03-05.html'));

        $prices = $this->durian('thcl-sau-rieng-2026-10-15.html');
        $this->assertSame([70000, 85000], $prices['sau-rieng-thai|dbscl']);
        $this->assertSame([65000, 71000], $prices['sau-rieng-ri6|dbscl']);
        // Tỉnh đầu tiên của Tây Nguyên trong bài là Đắk Lắk; bỏ "hàng lỗi"
        $this->assertSame([88000, 95000], $prices['sau-rieng-thai|tay-nguyen']);
        $this->assertSame([35000, 35000], $prices['sau-rieng-ri6|gia-lai']);
    }

    public function test_durian_articles_are_found_on_tag_pages_and_dated_by_listing(): void
    {
        $listing = '<ul><li><h3><a href="https://thuonghieucongluan.com.vn/gia-sau-rieng-hom-nay-14-2-sau-thai-a-tiep-tuc-tang-a253194.html">14/2</a></h3>'
            .'<time class="news-timerange" datetime="2025-02-14T05:49:00+07:00">14/02/2025</time></li>'
            .'<li><h3><a href="https://thuonghieucongluan.com.vn/gia-sau-rieng-hom-nay-27-6-sau-thai-giam-a268253.html">27/6</a></h3>'
            .'<time class="news-timerange" datetime="2025-06-27T06:30:00+07:00">27/06/2025</time></li>'
            .'<li><a href="https://thuonghieucongluan.com.vn/tin-khac-a1.html">Tin khác</a><time datetime="2025-06-27T07:00:00+07:00">27/06</time></li></ul>';

        Http::fake([
            'thuonghieucongluan.com.vn/robots.txt' => Http::response("User-agent: *\nAllow: /"),
            'thuonghieucongluan.com.vn/news-tag254327/gia-sau-rieng/trang-1' => Http::response($listing),
            'thuonghieucongluan.com.vn/news-tag264505/gia-sau-rieng-hom-nay/trang-1' => Http::response($listing),
            'thuonghieucongluan.com.vn/news-tag*' => Http::response('<ul><li><a href="https://thuonghieucongluan.com.vn/tin-khac-a1.html">Tin khác</a></li></ul>'),
            'thuonghieucongluan.com.vn/gia-sau-rieng-hom-nay-27-6-*' => Http::response($this->fixture('thcl-sau-rieng-2025-06-27.html')),
        ]);

        $this->artisan('crawl:backfill', ['sources' => ['thcl-sau-rieng'], '--from' => '2025-06', '--to' => '2025-06'])
            ->expectsOutputToContain('1 bài,   0 đã có, lưu   14 giá, 0 lỗi')
            ->assertSuccessful();

        // Ngày giá lấy theo datePublished (JSON-LD) của bài
        $this->assertSame(76500, $this->price('sau-rieng-thai', 'dbscl', '2025-06-27'));
        Http::assertNotSent(fn ($request): bool => str_contains($request->url(), 'a253194'));
        // Mỗi tag đọc tới trang đầu tiên không còn bài: tag 1, 2 (2 trang), tag 3 (1 trang)
        Http::assertSent(fn ($request): bool => str_ends_with($request->url(), 'gia-sau-rieng-hom-nay/trang-2'));
        Http::assertNotSent(fn ($request): bool => str_ends_with($request->url(), 'gia-sau-rieng-hom-nay/trang-3'));
    }

    /**
     * @return array<string, int> mã mặt hàng => giá trung bình
     */
    private function riceAvg(string $fixture = '', ?string $html = null): array
    {
        $page = app(SitemapArticleAdapter::class)->parse(PriceSource::query()->where('code', 'congthuong-lua-gao')->sole(), $html ?? $this->fixture($fixture));
        $codes = Product::query()->pluck('code', 'id');

        $prices = [];
        foreach ($page->rows as $row) {
            $prices[$codes[$row->productId]] = $row->avg;
        }

        return $prices;
    }

    /**
     * @return array<string, array{0: int, 1: int}> "mặt hàng|khu vực" => [min, max]
     */
    private function durian(string $fixture): array
    {
        $page = app(DurianArticleAdapter::class)->parse(PriceSource::query()->where('code', 'thcl-sau-rieng')->sole(), $this->fixture($fixture));
        $products = Product::query()->pluck('code', 'id');
        $regions = Region::query()->pluck('code', 'id');

        $prices = [];
        foreach ($page->rows as $row) {
            $this->assertSame('kg', $row->unit);
            $prices[$products[$row->productId].'|'.$regions[$row->regionId]] = [$row->min, $row->max];
        }

        return $prices;
    }

    private function price(string $product, string $region, string $date): ?int
    {
        return Price::query()
            ->where('product_id', Product::query()->where('code', $product)->value('id'))
            ->where('region_id', Region::query()->where('code', $region)->value('id'))
            ->where('date', $date)
            ->value('price_avg');
    }

    private function fixture(string $name): string
    {
        return file_get_contents(base_path('tests/Fixtures/crawl/'.$name));
    }
}
