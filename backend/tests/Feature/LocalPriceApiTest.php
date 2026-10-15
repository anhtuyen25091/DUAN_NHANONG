<?php

namespace Tests\Feature;

use App\Enums\BuyerStatus;
use App\Enums\ReportStatus;
use App\Models\Buyer;
use App\Models\Price;
use App\Models\PriceReport;
use App\Models\Product;
use App\Models\Region;
use App\Models\Shop;
use App\Models\User;
use Database\Seeders\CatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LocalPriceApiTest extends TestCase
{
    use RefreshDatabase;

    /** Buôn Ma Thuột */
    private const BMT = [12.6667, 108.0500];

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(CatalogSeeder::class);
        $this->travelTo(now()->setDate(2026, 10, 15)->setTime(9, 0));
    }

    public function test_register_buyer_then_wait_for_approval_before_posting(): void
    {
        $this->putJson(route('api.v1.buyer.save'), $this->profile())->assertUnauthorized();

        $user = User::factory()->create();
        $this->actingAs($user)->putJson(route('api.v1.buyer.save'), $this->profile())
            ->assertCreated()
            ->assertJsonPath('data.status', 'pending')
            ->assertJsonPath('data.province_name', 'Đắk Lắk');

        $this->postJson(route('api.v1.buyer.prices.store'), ['product' => 'ca-phe-robusta', 'price' => 93000])
            ->assertForbidden()
            ->assertJsonPath('message', 'Hồ sơ điểm mua chưa được duyệt nên chưa đăng giá được.');

        $user->refresh()->buyer->approve();
        $shop = Shop::query()->sole();
        $this->assertTrue($shop->is_active);
        $this->assertSame('Đại lý cà phê Hai Lúa', $shop->name);

        $this->postJson(route('api.v1.buyer.prices.store'), ['product' => 'ca-phe-robusta', 'price' => 93000])
            ->assertCreated()
            ->assertJsonPath('data.status', 'published');

        // Hồ sơ chỉ chọn "thu mua" nên không đăng giá phân bón được
        $this->postJson(route('api.v1.buyer.prices.store'), ['product' => 'ure-ca-mau', 'price' => 500000])
            ->assertUnprocessable();
    }

    public function test_same_day_price_is_updated_not_duplicated_and_backdate_is_limited(): void
    {
        $buyer = $this->buyer();
        $this->actingAs($buyer->user)->postJson(route('api.v1.buyer.prices.store'), ['product' => 'ca-phe-robusta', 'price' => 93000])->assertCreated();
        $this->postJson(route('api.v1.buyer.prices.store'), ['product' => 'ca-phe-robusta', 'price' => 93500])->assertCreated();

        $this->assertSame(93500, PriceReport::query()->sole()->price);

        $this->postJson(route('api.v1.buyer.prices.store'), ['product' => 'ca-phe-robusta', 'price' => 93000, 'date' => '2026-10-01'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('date');
        $this->postJson(route('api.v1.buyer.prices.store'), ['product' => 'ca-phe-robusta', 'price' => 93000, 'date' => '2026-10-16'])
            ->assertUnprocessable();
    }

    public function test_price_far_from_province_crawled_price_waits_for_review(): void
    {
        $this->crawled('ca-phe-robusta', 'dak-lak', 93000);
        $buyer = $this->buyer();

        $this->actingAs($buyer->user)->postJson(route('api.v1.buyer.prices.store'), ['product' => 'ca-phe-robusta', 'price' => 95000])
            ->assertJsonPath('data.status', 'published');

        $this->postJson(route('api.v1.buyer.prices.store'), ['product' => 'ca-phe-robusta', 'price' => 150000, 'date' => '2026-10-14'])
            ->assertJsonPath('data.status', 'needs_review')
            ->assertJsonPath('data.review_reason', 'Lệch 61% so với giá chung đắk lắk (93.000 đ)');
    }

    public function test_nearby_buyers_median_is_preferred_reference(): void
    {
        // Giá chung của tỉnh cũ (cao), nhưng 2 điểm mua gần đó đều ~80.000 → so với 80.000
        $this->crawled('ca-phe-robusta', 'dak-lak', 120000);
        $this->report($this->buyer(lat: 12.68), 'ca-phe-robusta', 80000);
        $this->report($this->buyer(lat: 12.70), 'ca-phe-robusta', 81000);

        $buyer = $this->buyer(lat: 12.66);
        $this->actingAs($buyer->user)->postJson(route('api.v1.buyer.prices.store'), ['product' => 'ca-phe-robusta', 'price' => 82000])
            ->assertJsonPath('data.status', 'published');
    }

    public function test_local_prices_groups_by_product_within_radius(): void
    {
        $near1 = $this->buyer(name: 'Đại lý A', lat: 12.68);
        $near2 = $this->buyer(name: 'Đại lý B', lat: 12.75);
        $far = $this->buyer(name: 'Đại lý xa', lat: 13.98); // ~146 km
        $pending = $this->buyer(name: 'Chưa duyệt', lat: 12.67, status: BuyerStatus::Pending);

        $this->report($near1, 'ca-phe-robusta', 92000, '2026-10-13');
        $this->report($near1, 'ca-phe-robusta', 93000, '2026-10-15'); // giá mới nhất của A
        $this->report($near2, 'ca-phe-robusta', 94000, '2026-10-15');
        $this->report($far, 'ca-phe-robusta', 99000, '2026-10-15');
        $this->report($pending, 'ca-phe-robusta', 99000, '2026-10-15');
        $this->report($near2, 'ca-phe-robusta', 1, '2026-10-14', ReportStatus::NeedsReview);
        $this->crawled('ca-phe-robusta', 'dak-lak', 93200);

        $this->getJson(route('api.v1.local-prices.index', ['lat' => self::BMT[0], 'lng' => self::BMT[1], 'radius' => 30]))
            ->assertOk()
            ->assertJsonPath('meta.province', 'dak-lak')
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.product.code', 'ca-phe-robusta')
            ->assertJsonPath('data.0.count', 2)
            ->assertJsonPath('data.0.min', 93000)
            ->assertJsonPath('data.0.max', 94000)
            ->assertJsonPath('data.0.reference.price', 93200)
            // Nông sản: điểm trả giá cao xếp trước
            ->assertJsonPath('data.0.entries.0.buyer.name', 'Đại lý B')
            ->assertJsonPath('data.0.entries.1.price', 93000);
    }

    public function test_fertilizer_is_sorted_cheapest_first_and_filter_by_type(): void
    {
        $a = $this->buyer(name: 'Cửa hàng A', dealsIn: ['phan_bon']);
        $b = $this->buyer(name: 'Cửa hàng B', lat: 12.70, dealsIn: ['phan_bon', 'thu_mua']);
        $this->report($a, 'ure-ca-mau', 520000);
        $this->report($b, 'ure-ca-mau', 505000);
        $this->report($b, 'ca-phe-robusta', 93000);

        $this->getJson(route('api.v1.local-prices.index', ['lat' => self::BMT[0], 'lng' => self::BMT[1], 'type' => 'phan_bon']))
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.entries.0.buyer.name', 'Cửa hàng B')
            ->assertJsonPath('data.0.entries.0.price', 505000);
    }

    public function test_three_flags_from_different_devices_send_price_to_review(): void
    {
        $report = $this->report($this->buyer(), 'ca-phe-robusta', 93000);
        $flag = fn (string $uuid) => $this->postJson(route('api.v1.local-prices.flag', $report), ['reason' => 'Sai'], ['X-Device-Id' => $uuid]);

        $flag('0b7c1f0e-8a2e-4c55-9d1e-3f4a5b6c7d81')->assertOk();
        $flag('0b7c1f0e-8a2e-4c55-9d1e-3f4a5b6c7d81')->assertOk(); // cùng máy không tính 2 lần
        $flag('0b7c1f0e-8a2e-4c55-9d1e-3f4a5b6c7d82')->assertOk();
        $this->assertSame(ReportStatus::Published, $report->fresh()->status);

        $flag('0b7c1f0e-8a2e-4c55-9d1e-3f4a5b6c7d83')->assertOk();
        $this->assertSame(ReportStatus::NeedsReview, $report->fresh()->status);
        $this->assertSame(3, $report->fresh()->flags_count);
    }

    public function test_save_my_location_uses_province_center_without_gps(): void
    {
        $user = User::factory()->create(['phone' => '0911111111']);

        $this->actingAs($user)->putJson(route('api.v1.me.location'), ['province' => 'dak-lak', 'radius' => 20])
            ->assertOk()
            ->assertJsonPath('data.lat', 12.6667)
            ->assertJsonPath('data.radius', 20);

        $this->putJson(route('api.v1.me.location'), ['province' => 'dak-lak', 'lat' => 12.71, 'lng' => 108.12, 'label' => 'Xã Hòa Thuận'])
            ->assertJsonPath('data.label', 'Xã Hòa Thuận');

        $this->getJson(route('api.v1.user'))->assertJsonPath('data.location.lat', 12.71)->assertJsonPath('data.location.province_name', 'Đắk Lắk');
    }

    public function test_rejected_profile_goes_back_to_pending_when_resubmitted(): void
    {
        $buyer = $this->buyer(status: BuyerStatus::Pending);
        $buyer->reject('Thiếu địa chỉ');

        $this->actingAs($buyer->user)->getJson(route('api.v1.buyer.show'))->assertJsonPath('data.admin_note', 'Thiếu địa chỉ');
        $this->putJson(route('api.v1.buyer.save'), $this->profile(['address' => '12 Lê Duẩn']))->assertJsonPath('data.status', 'pending');
    }

    public function test_cannot_delete_other_buyers_price(): void
    {
        $report = $this->report($this->buyer(), 'ca-phe-robusta', 93000);
        $other = $this->buyer(name: 'Khác');

        $this->actingAs($other->user)->deleteJson(route('api.v1.buyer.prices.destroy', $report))->assertNotFound();
        $this->actingAs($report->buyer->user)->deleteJson(route('api.v1.buyer.prices.destroy', $report))->assertNoContent();
    }

    /**
     * @param  array<string, mixed>  $override
     * @return array<string, mixed>
     */
    private function profile(array $override = []): array
    {
        return [
            'name' => 'Đại lý cà phê Hai Lúa',
            'kind' => 'dai_ly',
            'deals_in' => ['thu_mua'],
            'phone' => '0262 3 456 789',
            'address' => 'QL14, Buôn Ma Thuột',
            'province_code' => 'dak-lak',
            'lat' => self::BMT[0],
            'lng' => self::BMT[1],
            'goods' => 'Thu mua cà phê, tiêu',
            ...$override,
        ];
    }

    /**
     * @param  list<string>  $dealsIn
     */
    private function buyer(string $name = 'Đại lý', float $lat = self::BMT[0], BuyerStatus $status = BuyerStatus::Approved, array $dealsIn = ['thu_mua']): Buyer
    {
        $factory = Buyer::factory()->state(['name' => $name, 'lat' => $lat, 'deals_in' => $dealsIn]);

        return ($status === BuyerStatus::Approved ? $factory->approved() : $factory)->create()->fresh();
    }

    private function report(Buyer $buyer, string $code, int $price, string $date = '2026-10-15', ReportStatus $status = ReportStatus::Published): PriceReport
    {
        $product = Product::query()->where('code', $code)->firstOrFail();

        return PriceReport::factory()->for($buyer)->for($product)->create(['date' => $date, 'price' => $price, 'unit' => $product->unit, 'status' => $status]);
    }

    private function crawled(string $code, string $region, int $price): void
    {
        Price::factory()->create([
            'product_id' => Product::query()->where('code', $code)->value('id'),
            'region_id' => Region::query()->where('code', $region)->value('id'),
            'date' => '2026-10-14',
            'price_min' => $price, 'price_max' => $price, 'price_avg' => $price,
        ]);
    }
}
