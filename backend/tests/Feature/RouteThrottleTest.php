<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Mỗi giới hạn số lần gọi có bộ đếm riêng: dùng app bình thường (nhóm 120 lần / phút) không làm khóa
 * các route có giới hạn thấp hơn (VD danh sách chào hàng 60 lần / phút).
 */
class RouteThrottleTest extends TestCase
{
    use RefreshDatabase;

    public function test_route_limits_do_not_share_the_user_counter(): void
    {
        Sanctum::actingAs(User::factory()->create());

        for ($i = 0; $i < 70; $i++) {
            $this->getJson(route('api.v1.user'))->assertOk();
        }

        $this->getJson(route('api.v1.offers.index', ['lat' => 10.03, 'lng' => 105.78]))->assertOk();
    }
}
