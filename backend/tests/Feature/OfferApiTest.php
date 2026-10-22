<?php

namespace Tests\Feature;

use App\Models\Buyer;
use App\Models\User;
use Database\Seeders\CatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Chào bán: nông dân đăng lô hàng, điểm mua / lái quanh đó trả giá, nông dân chọn 1 giá.
 */
class OfferApiTest extends TestCase
{
    use RefreshDatabase;

    private User $farmer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(CatalogSeeder::class);
        $this->travelTo(now()->setDate(2026, 10, 22)->setTime(8, 0));
        $this->farmer = User::factory()->create(['name' => 'Chú Năm', 'phone' => '0912345678']);
    }

    public function test_farmer_posts_offer_and_nearby_buyers_see_it(): void
    {
        $offer = $this->postOffer();
        $this->assertSame('open', $offer['status']);
        $this->assertSame('0912345678', $offer['farmer']['phone']);

        $buyer = $this->approvedBuyer('Đại lý Hai Lúa');
        Sanctum::actingAs($buyer);
        $this->getJson(route('api.v1.offers.index', ['lat' => 12.67, 'lng' => 108.05]))
            ->assertOk()
            ->assertJsonPath('meta.can_bid', true)
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.product_name', 'Cà phê nhân xô')
            // Chưa chọn giá thì không lộ số nông dân
            ->assertJsonPath('data.0.farmer.phone', null);

        // Xa hơn bán kính: không thấy
        $this->getJson(route('api.v1.offers.index', ['lat' => 10.04, 'lng' => 105.74]))->assertJsonCount(0, 'data');
        // Nông dân không thấy lô của chính mình trong chợ
        Sanctum::actingAs($this->farmer);
        $this->getJson(route('api.v1.offers.index', ['lat' => 12.67, 'lng' => 108.05]))->assertJsonCount(0, 'data');
    }

    public function test_buyers_bid_farmer_accepts_one_and_phones_are_shared(): void
    {
        $offer = $this->postOffer();
        $hai = $this->approvedBuyer('Đại lý Hai Lúa');
        $ba = $this->approvedBuyer('Đại lý Ba Thành');

        Sanctum::actingAs($hai);
        $this->putJson(route('api.v1.offers.bid', $offer['id']), ['price' => 92500])->assertOk()->assertJsonPath('data.my_bid.price', 92500);
        // Sửa giá: vẫn 1 giá
        $this->putJson(route('api.v1.offers.bid', $offer['id']), ['price' => 93000, 'note' => 'Lấy cả lô'])->assertOk()->assertJsonPath('data.bids_count', 1);
        Sanctum::actingAs($ba);
        $this->putJson(route('api.v1.offers.bid', $offer['id']), ['price' => 93500])->assertOk()->assertJsonPath('data.best_price', 93500)
            // Người mua không thấy giá của người khác
            ->assertJsonPath('data.bids', null);

        Sanctum::actingAs($this->farmer);
        $mine = $this->getJson(route('api.v1.offers.mine'))->assertOk()->json('data.0');
        $this->assertSame([93500, 93000], array_column($mine['bids'], 'price'));
        $this->assertSame('Đại lý Ba Thành', $mine['bids'][0]['buyer']['name']);
        $this->assertNotNull($mine['bids'][0]['buyer']['phone']);

        $this->postJson(route('api.v1.offers.accept', [$offer['id'], $mine['bids'][1]['id']]))
            ->assertOk()
            ->assertJsonPath('data.status', 'sold')
            ->assertJsonPath('data.bids.0.status', 'declined')
            ->assertJsonPath('data.bids.1.status', 'accepted');

        // Người được chọn thấy số nông dân; người bị từ chối thì không
        Sanctum::actingAs($hai);
        $this->getJson(route('api.v1.offers.show', $offer['id']))->assertJsonPath('data.farmer.phone', '0912345678')->assertJsonPath('data.my_bid.status', 'accepted');
        Sanctum::actingAs($ba);
        $this->getJson(route('api.v1.offers.show', $offer['id']))->assertJsonPath('data.farmer.phone', null)->assertJsonPath('data.my_bid.status', 'declined');
        $this->getJson(route('api.v1.offers.my-bids'))->assertJsonCount(1, 'data');
        // Đã bán: không nhận giá nữa
        $this->putJson(route('api.v1.offers.bid', $offer['id']), ['price' => 99000])->assertUnprocessable();
    }

    public function test_only_approved_buyers_or_business_members_can_bid(): void
    {
        $offer = $this->postOffer();
        $stranger = User::factory()->create();
        Sanctum::actingAs($stranger);
        $this->getJson(route('api.v1.offers.index', ['lat' => 12.67, 'lng' => 108.05]))->assertJsonPath('meta.can_bid', false);
        $this->putJson(route('api.v1.offers.bid', $offer['id']), ['price' => 93000])->assertForbidden();

        // Lái con của doanh nghiệp thu mua thì được
        $owner = User::factory()->create(['phone' => '0900000010']);
        Sanctum::actingAs($owner);
        $this->postJson(route('api.v1.business.store'), ['name' => 'Nông sản Hai Lúa'])->assertCreated();
        $this->postJson(route('api.v1.business.members.store'), ['name' => 'Lái Tèo', 'phone' => '0911000001', 'password' => 'secret1'])->assertCreated();
        Sanctum::actingAs(User::query()->where('phone', '0911000001')->firstOrFail());
        $this->putJson(route('api.v1.offers.bid', $offer['id']), ['price' => 93000])->assertOk();

        Sanctum::actingAs($this->farmer);
        $this->assertSame('Lái Tèo · Nông sản Hai Lúa', $this->getJson(route('api.v1.offers.show', $offer['id']))->json('data.bids.0.buyer.name'));
        // Nông dân không tự trả giá lô của mình
        $this->putJson(route('api.v1.offers.bid', $offer['id']), ['price' => 93000])->assertUnprocessable();
    }

    public function test_closed_or_expired_offers_leave_the_market(): void
    {
        $offer = $this->postOffer();
        $buyer = $this->approvedBuyer('Đại lý Hai Lúa');

        Sanctum::actingAs($this->farmer);
        $this->patchJson(route('api.v1.offers.update', $offer['id']), ['status' => 'closed'])->assertOk()->assertJsonPath('data.status', 'closed');
        Sanctum::actingAs($buyer);
        $this->getJson(route('api.v1.offers.index', ['lat' => 12.67, 'lng' => 108.05]))->assertJsonCount(0, 'data');
        $this->getJson(route('api.v1.offers.show', $offer['id']))->assertNotFound();

        Sanctum::actingAs($this->farmer);
        $this->patchJson(route('api.v1.offers.update', $offer['id']), ['status' => 'open'])->assertOk();
        // Quá 7 ngày sau ngày thu hoạch: hết hạn
        $this->travel(14)->days();
        $this->getJson(route('api.v1.offers.show', $offer['id']))->assertJsonPath('data.status', 'expired');
        Sanctum::actingAs($buyer);
        $this->getJson(route('api.v1.offers.index', ['lat' => 12.67, 'lng' => 108.05]))->assertJsonCount(0, 'data');
    }

    /**
     * @return array<string, mixed>
     */
    private function postOffer(): array
    {
        Sanctum::actingAs($this->farmer);

        return $this->postJson(route('api.v1.offers.store'), [
            'product_code' => 'ca-phe-robusta',
            'product_name' => 'Cà phê nhân xô',
            'quantity_kg' => 3000,
            'expected_price' => 94000,
            'harvest_date' => '2026-10-28',
            'lat' => 12.68,
            'lng' => 108.06,
            'place_label' => 'Xã Hòa Thuận, Đắk Lắk',
        ])->assertCreated()->json('data');
    }

    private function approvedBuyer(string $name): User
    {
        return Buyer::factory()->approved()->create(['name' => $name])->user;
    }
}
