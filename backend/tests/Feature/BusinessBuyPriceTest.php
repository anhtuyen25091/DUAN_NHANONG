<?php

namespace Tests\Feature;

use App\Models\Purchase;
use App\Models\User;
use Database\Seeders\CatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Chủ doanh nghiệp chốt giá mua mỗi ngày cho lái con: lái mua vượt giá thì phiếu bị đánh dấu (báo chủ) hoặc bị chặn.
 */
class BusinessBuyPriceTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $buyer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(CatalogSeeder::class);
        $this->travelTo(now()->setDate(2026, 10, 22)->setTime(8, 0));
        $this->owner = User::factory()->create(['name' => 'Anh Hai', 'phone' => '0900000010']);
        Sanctum::actingAs($this->owner);
        $this->postJson(route('api.v1.business.store'), ['name' => 'Nông sản Hai Lúa'])->assertCreated();
        $this->postJson(route('api.v1.business.members.store'), ['name' => 'Lái Tèo', 'phone' => '0911000001', 'password' => 'secret1'])->assertCreated();
        $this->buyer = User::query()->where('phone', '0911000001')->firstOrFail();
    }

    public function test_owner_sets_daily_prices_and_latest_price_applies_until_changed(): void
    {
        $this->putJson(route('api.v1.business.prices.save'), ['date' => '2026-10-21', 'items' => [
            ['product_code' => 'ca-phe-robusta', 'max_price' => 92000],
            ['product_code' => 'ho-tieu', 'max_price' => 150000],
        ]])->assertOk()->assertJsonCount(2, 'data.items');
        $this->putJson(route('api.v1.business.prices.save'), ['date' => '2026-10-22', 'items' => [
            ['product_code' => 'ca-phe-robusta', 'max_price' => 93000],
            // Bỏ giới hạn hồ tiêu từ hôm nay
            ['product_code' => 'ho-tieu', 'max_price' => null],
        ]])->assertOk();

        // Lái xem được giá chốt hôm nay; hôm qua vẫn là giá cũ
        Sanctum::actingAs($this->buyer);
        $this->getJson(route('api.v1.business.prices.index'))
            ->assertOk()
            ->assertJsonPath('data.mode', 'warn')
            ->assertJsonCount(1, 'data.items')
            ->assertJsonPath('data.items.0.product_code', 'ca-phe-robusta')
            ->assertJsonPath('data.items.0.max_price', 93000);
        $this->getJson(route('api.v1.business.prices.index', ['date' => '2026-10-21']))
            ->assertJsonCount(2, 'data.items');

        // Lái không chốt giá được
        $this->putJson(route('api.v1.business.prices.save'), ['items' => []])->assertForbidden();
    }

    public function test_buyer_over_limit_is_flagged_in_warn_mode(): void
    {
        $this->putJson(route('api.v1.business.prices.save'), ['items' => [['product_code' => 'ca-phe-robusta', 'max_price' => 93000]]])->assertOk();

        Sanctum::actingAs($this->buyer);
        $ok = $this->postJson(route('api.v1.purchases.store'), $this->purchase(93000))->assertCreated()->json('data');
        $this->assertSame([], $ok['price_warnings']);
        $this->assertFalse($ok['over_limit']);

        $over = $this->postJson(route('api.v1.purchases.store'), $this->purchase(95000))
            ->assertCreated()
            ->assertJsonPath('data.over_limit', true)
            ->assertJsonPath('data.price_warnings.0.price', 95000)
            ->assertJsonPath('data.price_warnings.0.max_price', 93000)
            ->json('data');

        // Sửa về đúng giá thì hết cảnh báo
        $this->patchJson(route('api.v1.purchases.update', $over['id']), ['lines' => [['product_code' => 'ca-phe-robusta', 'name' => 'Cà phê', 'kg' => 500, 'price' => 92500]]])
            ->assertOk()
            ->assertJsonPath('data.over_limit', false);

        // Chủ thấy trong việc mới của lái
        $since = now()->subMinute()->toIso8601String();
        $this->postJson(route('api.v1.purchases.store'), $this->purchase(96000))->assertCreated();
        Sanctum::actingAs($this->owner);
        $texts = collect($this->getJson(route('api.v1.business.activity', ['since' => $since]))->assertOk()->json('data'))->pluck('text');
        $this->assertTrue($texts->contains(fn (string $t): bool => str_contains($t, 'vượt giá chốt')));
    }

    public function test_block_mode_rejects_over_limit_purchases_but_not_owner_or_sell(): void
    {
        $this->putJson(route('api.v1.business.prices.save'), ['mode' => 'block', 'items' => [['product_code' => 'ca-phe-robusta', 'max_price' => 93000]]])
            ->assertOk()
            ->assertJsonPath('data.mode', 'block');

        // Chủ tự mua giá cao: không bị chặn
        $this->postJson(route('api.v1.purchases.store'), $this->purchase(99000))->assertCreated();

        Sanctum::actingAs($this->buyer);
        $this->postJson(route('api.v1.purchases.store'), $this->purchase(95000))
            ->assertUnprocessable()
            ->assertJsonPath('errors.lines.0', 'Vượt giá chủ chốt: Cà phê 95.000 đ (chốt 93.000 đ). Hạ giá hoặc báo chủ chốt lại giá.');
        $this->postJson(route('api.v1.purchases.store'), [...$this->purchase(95000), 'kind' => 'sell'])->assertCreated();
        // Hàng tự gõ (không chọn mặt hàng) thì không kiểm tra
        $this->postJson(route('api.v1.purchases.store'), $this->purchase(95000, null))->assertCreated();

        $this->assertSame(1, Purchase::query()->where('user_id', $this->buyer->id)->where('kind', 'sell')->count());
    }

    /**
     * @return array<string, mixed>
     */
    private function purchase(int $price, ?string $product = 'ca-phe-robusta'): array
    {
        return [
            'customer_name' => 'Chú Năm',
            'date' => '2026-10-22',
            'lines' => [['product_code' => $product, 'name' => 'Cà phê', 'kg' => 500, 'price' => $price]],
        ];
    }
}
