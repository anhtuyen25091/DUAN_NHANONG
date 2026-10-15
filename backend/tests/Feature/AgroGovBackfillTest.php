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
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;
use Tests\TestCase;

/**
 * Lấy dữ liệu cũ từ CSDL giá agro.gov.vn (form ASP.NET: tra cứu rồi xuất Excel, lỗi thì đọc lưới từng trang).
 */
class AgroGovBackfillTest extends TestCase
{
    use RefreshDatabase;

    /** @var list<string> nút/lệnh của từng lần POST */
    private array $posts = [];

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed([CatalogSeeder::class, PriceSourceSeeder::class]);
        Sleep::fake();
        Http::preventStrayRequests();
    }

    public function test_month_is_read_from_excel_export_and_mapped_to_catalog(): void
    {
        $this->fakeAgro(exportFails: false);

        $this->artisan('crawl:backfill', ['sources' => ['agro-gov'], '--from' => '2021-11', '--to' => '2021-11'])
            ->expectsOutputToContain('1 bài,   0 đã có, lưu    7 giá, 0 lỗi')
            ->assertSuccessful();

        // Giá trang theo kg, phân bón trong danh mục tính theo bao 50 kg
        $this->assertDatabaseHas('prices', [
            'product_id' => $this->productId('ure-phu-my'),
            'region_id' => $this->regionId('an-giang'),
            'date' => '2021-11-30',
            'price_avg' => 910000,
            'unit' => 'bao',
        ]);
        $this->assertDatabaseHas('prices', [
            'product_id' => $this->productId('npk-20-20-15-binh-dien'),
            'region_id' => $this->regionId('an-giang'),
            'date' => '2021-11-29',
            'price_avg' => 860000,
        ]);
        $this->assertDatabaseHas('prices', [
            'product_id' => $this->productId('lua-ir-50404'),
            'region_id' => $this->regionId('an-giang'),
            'date' => '2021-11-30',
            'price_avg' => 5600,
            'unit' => 'kg',
        ]);
        // Cà phê không thuộc danh mục của nguồn; DAP Philippines chưa có trong danh mục;
        // dòng Tây Nguyên ghi giá bao (630.000) nằm ngoài khoảng giá theo kg nên bị bỏ
        $this->assertSame(7, Price::query()->count());
        $this->assertSame(0, Price::query()->where('region_id', $this->regionId('tay-nguyen'))->count());

        $this->assertSame(['Tra cứu', 'Xuất ra excel'], $this->posts);
        $log = CrawlLog::query()->sole();
        $this->assertSame(CrawlStatus::Success, $log->status);
        $this->assertSame('https://agro.gov.vn/vn/nguonwmy.aspx?thang=2021-11', $log->url);
    }

    public function test_finished_month_is_skipped_on_next_run(): void
    {
        $this->fakeAgro(exportFails: false);

        $this->artisan('crawl:backfill', ['sources' => ['agro-gov'], '--from' => '2021-11', '--to' => '2021-11'])->assertSuccessful();
        $this->artisan('crawl:backfill', ['sources' => ['agro-gov'], '--from' => '2021-11', '--to' => '2021-11'])
            ->expectsOutputToContain('1 bài,   1 đã có, lưu    0 giá')
            ->assertSuccessful();

        Http::assertSentCount(4); // robots + form + tra cứu + xuất Excel, lần 2 không gọi gì
    }

    public function test_falls_back_to_grid_pages_when_export_fails(): void
    {
        $this->fakeAgro(exportFails: true);

        $this->artisan('crawl:backfill', ['sources' => ['agro-gov'], '--from' => '2021-11', '--to' => '2021-11'])
            ->expectsOutputToContain('lưu    3 giá, 0 lỗi')
            ->assertSuccessful();

        $this->assertSame(['Tra cứu', 'Xuất ra excel', 'Page$2'], $this->posts);
        $this->assertDatabaseHas('prices', ['product_id' => $this->productId('ure-phu-my'), 'date' => '2021-11-29', 'price_avg' => 810000]);
        $this->assertDatabaseHas('prices', ['product_id' => $this->productId('npk-20-20-15-binh-dien'), 'date' => '2021-11-29', 'price_avg' => 860000]);
    }

    public function test_month_without_data_is_logged_empty(): void
    {
        Http::fake([
            'agro.gov.vn/robots.txt' => Http::response("User-agent: *\nAllow: /"),
            'agro.gov.vn/vn/nguonwmy.aspx' => Http::response($this->fixture('agro-form.html')),
        ]);

        $this->artisan('crawl:backfill', ['sources' => ['agro-gov'], '--from' => '2024-11', '--to' => '2024-11'])
            ->expectsOutputToContain('lưu    0 giá, 0 lỗi')
            ->assertSuccessful();

        $this->assertSame(CrawlStatus::Empty, CrawlLog::query()->sole()->status);
    }

    private function fakeAgro(bool $exportFails): void
    {
        Http::fake([
            'agro.gov.vn/robots.txt' => Http::response("User-agent: *\nAllow: /"),
            'agro.gov.vn/vn/nguonwmy.aspx' => function (Request $request) use ($exportFails) {
                if ($request->method() === 'GET') {
                    return Http::response($this->fixture('agro-form.html'));
                }

                $data = $request->data();
                $this->assertSame('01/11/2021', $data['ctl00$maincontent$tu_ngay']);
                $this->assertSame('30/11/2021', $data['ctl00$maincontent$den_ngay']);
                $this->assertArrayHasKey('__VIEWSTATE', $data);

                if (isset($data['ctl00$maincontent$Xem'])) {
                    $this->posts[] = $data['ctl00$maincontent$Xem'];

                    return Http::response($this->fixture('agro-grid-2021-11-page1.html'));
                }
                if (isset($data['ctl00$maincontent$tai_excel'])) {
                    $this->posts[] = $data['ctl00$maincontent$tai_excel'];

                    return $exportFails
                        ? Http::response('Runtime Error', 500)
                        : Http::response($this->fixture('agro-export-2021-11.xls'), 200, ['Content-Type' => 'application/vnd.ms-excel']);
                }

                $this->posts[] = $data['__EVENTARGUMENT'];

                return Http::response($this->fixture('agro-grid-2021-11-page2.html'));
            },
        ]);
    }

    private function fixture(string $name): string
    {
        return file_get_contents(base_path('tests/Fixtures/crawl/'.$name));
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
