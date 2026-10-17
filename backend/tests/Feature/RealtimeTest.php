<?php

namespace Tests\Feature;

use App\Models\Deal;
use App\Models\User;
use App\Realtime\Realtime;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Defer\DeferredCallbackCollection;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Mockery;
use Tests\TestCase;

/**
 * Cập nhật tức thì qua Ably: vé tạm chỉ nghe kênh của mình; việc mới trong đơn thì gửi tin cho bên kia.
 */
class RealtimeTest extends TestCase
{
    use RefreshDatabase;

    public function test_token_disabled_without_key(): void
    {
        config(['services.ably.key' => '']);
        Sanctum::actingAs(User::factory()->create());

        $this->getJson(route('api.v1.realtime.token'))->assertOk()->assertExactJson(['enabled' => false]);
    }

    public function test_token_only_allows_own_channel(): void
    {
        // Khóa giả: tạo vé tạm được ký ngay trên máy, không gọi mạng
        config(['services.ably.key' => 'appid.keyid:bimatgiamaythu']);
        $user = User::factory()->create();
        Sanctum::actingAs($user);

        $response = $this->getJson(route('api.v1.realtime.token'))->assertOk()->assertJsonPath('enabled', true);
        $response->assertJsonPath('channel', "user:{$user->id}");
        $this->assertSame([("user:{$user->id}") => ['subscribe']], json_decode($response->json('token_request.capability'), true));
        $this->assertSame((string) $user->id, $response->json('token_request.clientId'));
        $this->assertNotEmpty($response->json('token_request.mac'));
        $this->assertStringNotContainsString('bimatgiamaythu', $response->getContent());
    }

    public function test_deal_activity_publishes_to_other_side(): void
    {
        Http::fake();
        $realtime = Mockery::mock(Realtime::class);
        $this->app->instance(Realtime::class, $realtime);
        $seller = User::factory()->create();
        $buyer = User::factory()->create();
        $deal = Deal::factory()->joined()->create(['seller_id' => $seller->id, 'buyer_id' => $buyer->id, 'created_by' => $buyer->id]);

        $realtime->shouldReceive('publish')->once()->withArgs(fn (array $ids, array $data): bool => $ids === [$seller->id] && $data['dealId'] === $deal->uuid);
        $deal->recordActivity($buyer, 'vừa ghi đợt cân');
        $this->app[DeferredCallbackCollection::class]->invoke();
    }
}
