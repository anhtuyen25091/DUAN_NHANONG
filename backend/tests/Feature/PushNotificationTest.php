<?php

namespace Tests\Feature;

use App\Models\Deal;
use App\Models\Device;
use App\Models\User;
use Database\Seeders\CatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Defer\DeferredCallbackCollection;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Thông báo đẩy theo tài khoản (báo cả khi app đóng): đơn mua bán, phiếu gửi cho khách.
 */
class PushNotificationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::fake(['exp.host/*' => Http::response(['data' => [['status' => 'ok']]])]);
    }

    private function deviceOf(User $user, string $token): Device
    {
        return Device::query()->create(['uuid' => (string) Str::uuid(), 'push_token' => $token, 'platform' => 'android'])->forceFill(['user_id' => $user->id]);
    }

    /** @return list<string> các push token đã gửi tới */
    private function sentTo(): array
    {
        return Http::recorded()
            ->filter(fn ($pair) => str_contains($pair[0]->url(), 'exp.host'))
            ->flatMap(fn ($pair) => array_column($pair[0]->data(), 'to'))
            ->values()
            ->all();
    }

    public function test_device_is_linked_to_account_when_token_sent_with_login(): void
    {
        $user = User::factory()->create();
        $uuid = (string) Str::uuid();
        $token = $user->createToken('app')->plainTextToken;

        $this->putJson(route('api.v1.device.update'), ['push_token' => 'ExponentPushToken[a]'], ['X-Device-Id' => $uuid, 'Authorization' => "Bearer {$token}"])->assertOk();
        $this->assertSame($user->id, Device::query()->where('uuid', $uuid)->value('user_id'));

        // Đăng xuất (gửi không kèm đăng nhập): gỡ khỏi tài khoản
        $this->app['auth']->forgetGuards();
        $this->putJson(route('api.v1.device.update'), ['push_token' => 'ExponentPushToken[a]'], ['X-Device-Id' => $uuid])->assertOk();
        $this->assertNull(Device::query()->where('uuid', $uuid)->value('user_id'));
    }

    public function test_deal_activity_notifies_only_the_other_side(): void
    {
        $seller = User::factory()->create(['name' => 'Nông dân Ba']);
        $buyer = User::factory()->create(['name' => 'Lái Tư']);
        $this->deviceOf($seller, 'ExponentPushToken[seller]')->save();
        $this->deviceOf($buyer, 'ExponentPushToken[buyer]')->save();
        $deal = Deal::factory()->joined()->create(['seller_id' => $seller->id, 'buyer_id' => $buyer->id, 'created_by' => $buyer->id, 'title' => 'Cà phê vườn Ba']);

        $deal->recordActivity($buyer, 'vừa ghi đợt cân 1.250 kg');
        // Ngoài request: chạy các việc đã hẹn (defer) như lúc trả lời xong
        $this->app[DeferredCallbackCollection::class]->invoke();

        $this->assertSame(['ExponentPushToken[seller]'], $this->sentTo());
        $request = Http::recorded()->first()[0];
        $this->assertSame('🤝 Cà phê vườn Ba', $request->data()[0]['title']);
        $this->assertSame(['dealId' => $deal->uuid], $request->data()[0]['data']);
        $this->assertSame('updates', $request->data()[0]['channelId']);
    }

    public function test_customer_gets_push_when_purchase_sent_and_edited(): void
    {
        $this->seed(CatalogSeeder::class);
        $trader = User::factory()->create(['name' => 'Lái Tư']);
        $customer = User::factory()->create(['phone' => '0912345678']);
        $this->deviceOf($customer, 'ExponentPushToken[customer]')->save();
        $this->actingAs($trader, 'sanctum');

        $id = $this->postJson(route('api.v1.purchases.store'), [
            'customer_name' => 'Chú Năm', 'customer_phone' => '0912345678', 'date' => now()->toDateString(),
            'lines' => [['product_code' => 'ca-phe-robusta', 'name' => 'Cà phê', 'kg' => 100, 'price' => 90000]],
        ])->assertCreated()->json('data.id');
        // Request trong test đã tự chạy việc "sau khi trả lời" (gửi thông báo)
        $this->postJson(route('api.v1.purchases.send', $id))->assertOk();
        $this->assertSame(['ExponentPushToken[customer]'], $this->sentTo());

        $this->patchJson(route('api.v1.purchases.update', $id), ['paid' => 1_000_000])->assertOk();
        $this->assertCount(2, $this->sentTo());
        $this->assertStringContainsString('vừa sửa phiếu', Http::recorded()->last()[0]->data()[0]['title']);
    }
}
