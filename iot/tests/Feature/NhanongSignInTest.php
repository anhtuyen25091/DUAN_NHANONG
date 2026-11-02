<?php

namespace Tests\Feature;

use App\Models\Farm;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Đăng nhập mục Cảm biến bằng tài khoản Nhà Nông (dùng chung tài khoản với web / app Nhà Nông).
 */
class NhanongSignInTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Http::fake(['127.0.0.1:8000/api/v1/user' => function (Request $request) {
            return match ($request->header('Authorization')[0] ?? '') {
                'Bearer chu-ba' => Http::response(['data' => ['id' => 1, 'name' => 'Chú Ba', 'phone' => '0900000001', 'tier' => 'free', 'premium_until' => null]]),
                'Bearer lai-tu' => Http::response(['data' => ['id' => 2, 'name' => 'Lái Tư', 'phone' => '0900000002', 'tier' => 'premium', 'premium_until' => '2027-06-30']]),
                default => Http::response(['message' => 'Unauthenticated.'], 401),
            };
        }]);
    }

    public function test_first_sign_in_creates_account_without_email_and_reuses_it(): void
    {
        $first = $this->postJson(route('api.v1.auth.nhanong'), ['token' => 'chu-ba'])
            ->assertOk()
            ->assertJsonPath('user.name', 'Chú Ba')
            ->assertJsonPath('user.email', null)
            ->assertJsonPath('user.phone', '0900000001')
            ->assertJsonPath('user.nhanong_user_id', 1);

        $this->postJson(route('api.v1.auth.nhanong'), ['token' => 'chu-ba'])->assertOk()->assertJsonPath('user.id', $first->json('user.id'));
        $this->assertSame(1, User::query()->count());

        // Token cảm biến dùng được ngay
        $this->withToken($first->json('token'))->getJson(route('api.v1.me'))->assertOk()->assertJsonPath('data.plan.linked', true);
    }

    public function test_old_email_account_linked_to_nhanong_keeps_its_farms(): void
    {
        $old = User::factory()->create(['email' => 'tu@example.com']);
        $old->forceFill(['nhanong_user_id' => 2])->save();
        Farm::factory()->for($old)->create(['name' => 'Ao tôm Lái Tư']);

        $token = $this->postJson(route('api.v1.auth.nhanong'), ['token' => 'lai-tu'])
            ->assertOk()
            ->assertJsonPath('user.id', $old->id)
            ->assertJsonPath('user.email', 'tu@example.com')
            ->json('token');

        $this->withToken($token)->getJson(route('api.v1.farms.index'))->assertOk()->assertJsonPath('data.0.name', 'Ao tôm Lái Tư');
        // Dùng luôn gói của Nhà Nông
        $this->assertTrue($old->fresh()->hasPremium());
    }

    public function test_expired_token_and_backend_down(): void
    {
        $this->postJson(route('api.v1.auth.nhanong'), ['token' => 'het-han'])->assertJsonValidationErrors('token');
        $this->assertSame(0, User::query()->count());

        Http::fake(['127.0.0.1:8000/*' => fn () => throw new ConnectionException('down')]);
        $this->postJson(route('api.v1.auth.nhanong'), ['token' => 'chu-ba'])->assertStatus(503);
    }

    public function test_owner_shares_farm_by_phone(): void
    {
        $owner = User::factory()->create();
        $farm = Farm::factory()->for($owner)->create();
        $this->postJson(route('api.v1.auth.nhanong'), ['token' => 'chu-ba'])->assertOk();

        Sanctum::actingAs($owner);
        $this->postJson(route('api.v1.farm-members.store', $farm), ['phone' => '0911 222 333', 'role' => 'viewer'])->assertStatus(422);
        $this->postJson(route('api.v1.farm-members.store', $farm), ['phone' => '+84 900 000 001', 'role' => 'viewer'])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Chú Ba')
            ->assertJsonPath('data.phone', '0900000001')
            ->assertJsonPath('data.email', null);
        $this->postJson(route('api.v1.farm-members.store', $farm), ['role' => 'viewer'])->assertJsonValidationErrors(['phone', 'email']);
    }
}
