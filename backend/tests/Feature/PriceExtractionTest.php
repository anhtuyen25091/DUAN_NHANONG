<?php

namespace Tests\Feature;

use App\Crawling\Adapters\PageTableAdapter;
use App\Crawling\Adapters\ParsedPage;
use App\Crawling\Adapters\PriceRow;
use App\Crawling\Adapters\SitemapArticleAdapter;
use App\Enums\NameKind;
use App\Models\PriceSource;
use App\Models\Product;
use App\Models\Region;
use Database\Seeders\CatalogSeeder;
use Database\Seeders\PriceSourceSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Trích giá từ HTML thật đã lưu (tests/Fixtures/crawl) của từng nguồn.
 */
class PriceExtractionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed([CatalogSeeder::class, PriceSourceSeeder::class]);
    }

    public function test_pepper_prices_by_region_from_table(): void
    {
        $prices = $this->parse('vietbao-ho-tieu', 'vietbao-ho-tieu-2026-10-14.html');

        $this->assertSame([
            'ho-tieu|gia-lai' => [137500, 137500, 137500, 'kg'],
            'ho-tieu|ba-ria-vung-tau' => [138000, 138000, 138000, 'kg'],
            'ho-tieu|dak-lak' => [139000, 139000, 139000, 'kg'],
            'ho-tieu|binh-phuoc' => [137500, 137500, 137500, 'kg'],
            'ho-tieu|dak-nong' => [140000, 140000, 140000, 'kg'],
        ], $prices);
    }

    public function test_coffee_prices_by_region_from_sentences_skip_price_changes(): void
    {
        $prices = $this->parse('vietbao-ca-phe', 'vietbao-ca-phe-2026-10-14.html');

        $this->assertSame([92500, 93200, 92850, 'kg'], $prices['ca-phe-robusta|tay-nguyen']);
        $this->assertSame([93200, 93200, 93200, 'kg'], $prices['ca-phe-robusta|dak-nong']);
        $this->assertSame([93200, 93200, 93200, 'kg'], $prices['ca-phe-robusta|dak-lak']);
        // "tăng 200 đồng/kg ... ở mốc 93.200 đồng/kg": bỏ mức tăng, lấy giá
        $this->assertSame([93200, 93200, 93200, 'kg'], $prices['ca-phe-robusta|gia-lai']);
        $this->assertSame([92500, 92500, 92500, 'kg'], $prices['ca-phe-robusta|lam-dong']);
        $this->assertCount(5, $prices);
    }

    public function test_rice_tables_use_preceding_text_to_tell_paddy_from_rice(): void
    {
        $prices = $this->parse('vietbao-lua-gao', 'vietbao-lua-gao-2026-10-14.html');

        $this->assertSame([6500, 6600, 6550, 'kg'], $prices['lua-ds1|an-giang']);
        $this->assertSame([6200, 6300, 6250, 'kg'], $prices['lua-om-18|an-giang']);
        $this->assertSame([5800, 5900, 5850, 'kg'], $prices['lua-om-34|an-giang']);
        $this->assertSame([8700, 8850, 8775, 'kg'], $prices['gao-om-18|an-giang']);
        $this->assertSame([9200, 9400, 9300, 'kg'], $prices['gao-dai-thom-8|an-giang']);
        $this->assertSame([8600, 8750, 8675, 'kg'], $prices['gao-ir-504|an-giang']);
        $this->assertCount(11, $prices);
    }

    public function test_rice_sentences_in_older_article_format(): void
    {
        $prices = $this->parse('vietbao-lua-gao', 'vietbao-lua-gao-2026-08-31.html');

        $this->assertSame([5900, 6000, 5950, 'kg'], $prices['lua-om-34|an-giang']);
        // Bài ghi ngược "6.700 - 6.600": vẫn ra min/max đúng
        $this->assertSame([6600, 6700, 6650, 'kg'], $prices['lua-om-18|an-giang']);
        $this->assertSame([6300, 6400, 6350, 'kg'], $prices['lua-ir-50404|an-giang']);
        $this->assertSame([8900, 8950, 8925, 'kg'], $prices['gao-ir-504|an-giang']);
        $this->assertSame([8700, 8850, 8775, 'kg'], $prices['gao-om-18|an-giang']);
        $this->assertSame([7500, 7600, 7550, 'kg'], $prices['gao-om-380|an-giang']);
    }

    public function test_fertilizer_table_with_common_price_and_range(): void
    {
        $page = $this->parsePage('baohatinh-phan-bon', 'baohatinh-phan-bon-2026-05-18.html');
        $prices = $this->keyed($page->rows);

        $this->assertSame([1220000, 1270000, 1245000, 'bao'], $prices['dap-nga|toan-quoc']);
        $this->assertSame([660000, 690000, 675000, 'bao'], $prices['ure-ca-mau|toan-quoc']);
        $this->assertSame([690000, 740000, 715000, 'bao'], $prices['npk-16-16-8-phu-my|toan-quoc']);
        $this->assertSame([310000, 320000, 315000, 'bao'], $prices['lan-van-dien|toan-quoc']);
        $this->assertCount(12, $prices);
        $this->assertSame([], $page->unmatched);
        $this->assertSame('2026-05-18', $page->publishedOn?->toDateString());
    }

    public function test_wholesale_table_with_one_column_per_market(): void
    {
        $source = PriceSource::query()->where('code', 'vinacam-phan-bon-si')->firstOrFail();
        $html = file_get_contents(base_path('tests/Fixtures/crawl/vinacam-phan-bon-2026-10-02.html'));

        $page = app(PageTableAdapter::class)->parse($source, $html);
        $prices = $this->keyed($page->rows);

        $this->assertSame([11000, 11000, 11000, null], $prices['si-kali-nga-bot-do|tp-hcm']);
        $this->assertSame([11000, 11000, 11000, null], $prices['si-kali-nga-bot-do|ha-noi']);
        $this->assertSame([11000, 11000, 11000, null], $prices['si-kali-nga-bot-do|quy-nhon']);
        $this->assertSame([13500, 13500, 13500, null], $prices['si-ure-duc-malaysia|tp-hcm']);
        $this->assertSame([27500, 27500, 27500, null], $prices['si-dap-humic-tq-64|tp-hcm']);
        $this->assertCount(12, $prices);
        $this->assertSame([], $page->unmatched);
        $this->assertSame('2026-10-02', $page->publishedOn?->toDateString());
    }

    public function test_unknown_names_in_matching_table_are_reported(): void
    {
        Product::query()->where('code', 'kali-bot-phu-my')->delete();

        $page = $this->parsePage('baohatinh-phan-bon', 'baohatinh-phan-bon-2026-05-18.html');

        $this->assertSame([['kind' => NameKind::Product, 'name' => 'Kali bột Phú Mỹ']], $page->unmatched);
    }

    public function test_old_coffee_grid_skips_fob_row_and_reads_published_date(): void
    {
        $page = $this->parsePage('baoquocte-ca-phe', 'baoquocte-ca-phe-2021-11-15.html');

        // "FOB (TP. HCM) 2.332" là giá xuất khẩu USD/tấn: nằm ngoài khoảng giá hợp lý nên bị bỏ
        $this->assertSame([
            'ca-phe-robusta|dak-lak' => [41300, 41300, 41300, null],
            'ca-phe-robusta|lam-dong' => [40400, 40400, 40400, null],
            'ca-phe-robusta|gia-lai' => [41200, 41200, 41200, null],
            'ca-phe-robusta|dak-nong' => [41200, 41200, 41200, null],
        ], $this->keyed($page->rows));
        $this->assertSame('2021-11-15', $page->publishedOn?->toDateString());
    }

    public function test_several_provinces_share_the_price_that_follows_them(): void
    {
        // "Đắk Nông, Đắk Lắk (83.000 đ/kg); Bình Phước (84.000 đ/kg) và Bà Rịa - Vũng Tàu ... 85.000 đ/kg"
        $prices = $this->parse('baoquocte-ho-tieu', 'baoquocte-ho-tieu-2021-11-15.html');

        $this->assertSame([
            'gia-lai' => 82500, 'dong-nai' => 83000, 'dak-nong' => 83000, 'dak-lak' => 83000, 'binh-phuoc' => 84000, 'ba-ria-vung-tau' => 85000,
        ], collect($prices)->mapWithKeys(fn (array $p, string $key): array => [explode('|', $key)[1] => $p[2]])->all());
    }

    public function test_combined_article_reads_only_the_section_of_each_product(): void
    {
        // Bài "Giá nông sản hôm nay" có phần cà phê (bảng lồng trong bảng, kèm tỷ giá USD) rồi phần tiêu
        $coffee = $this->parse('baoquocte-ca-phe', 'baoquocte-nong-san-2025-06-27.html');
        $pepper = $this->parse('baoquocte-ho-tieu', 'baoquocte-nong-san-2025-06-27.html');

        $this->assertSame(['dak-lak' => 93800, 'lam-dong' => 93500, 'gia-lai' => 93700, 'dak-nong' => 93800], collect($coffee)->mapWithKeys(fn (array $p, string $key): array => [explode('|', $key)[1] => $p[2]])->all());
        $this->assertSame(
            ['dak-lak' => 128000, 'dak-nong' => 128000, 'gia-lai' => 126000, 'dong-nai' => 126000, 'ba-ria-vung-tau' => 127000, 'binh-phuoc' => 127000],
            collect($pepper)->mapWithKeys(fn (array $p, string $key): array => [explode('|', $key)[1] => $p[2]])->all(),
        );
    }

    /**
     * @return array<string, array{0: int, 1: int, 2: int, 3: string|null}>
     */
    private function parse(string $sourceCode, string $fixture): array
    {
        return $this->keyed($this->parsePage($sourceCode, $fixture)->rows);
    }

    private function parsePage(string $sourceCode, string $fixture): ParsedPage
    {
        $source = PriceSource::query()->where('code', $sourceCode)->firstOrFail();
        $html = file_get_contents(base_path('tests/Fixtures/crawl/'.$fixture));

        return app(SitemapArticleAdapter::class)->parse($source, $html);
    }

    /**
     * @param  list<PriceRow>  $rows
     * @return array<string, array{0: int, 1: int, 2: int, 3: string|null}>
     */
    private function keyed(array $rows): array
    {
        $products = Product::query()->pluck('code', 'id');
        $regions = Region::query()->pluck('code', 'id');

        $keyed = [];
        foreach ($rows as $row) {
            $keyed[$products[$row->productId].'|'.$regions[$row->regionId]] = [$row->min, $row->max, $row->avg, $row->unit];
        }

        return $keyed;
    }
}
