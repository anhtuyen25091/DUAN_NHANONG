<?php

namespace Tests\Feature;

use App\Enums\PriceStatus;
use App\Models\Plan;
use App\Models\Price;
use App\Models\PriceSource;
use App\Models\Product;
use App\Models\Region;
use App\Models\User;
use Carbon\CarbonImmutable;
use Database\Seeders\CatalogSeeder;
use Database\Seeders\PlanSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Mức xem lịch sử giá: khách 10 ngày, tài khoản đăng ký 30 ngày, tài khoản có gói xem toàn bộ.
 */
class PriceHistoryAccessTest extends TestCase
{
    use RefreshDatabase;

    private Product $coffee;

    private Region $dakLak;

    protected function setUp(): void
    {
        parent::setUp();

        $this->travelTo(CarbonImmutable::parse('2026-10-15 09:00'));
        $this->seed(CatalogSeeder::class);
        $this->coffee = Product::query()->where('code', 'ca-phe-robusta')->firstOrFail();
        $this->dakLak = Region::query()->where('code', 'dak-lak')->firstOrFail();

        // Giá mỗi ngày trong 5 năm: 2021-10-16 → 2026-10-15
        $source = PriceSource::factory()->create();
        $rows = [];
        for ($date = CarbonImmutable::parse('2021-10-16'); $date->lte('2026-10-15'); $date = $date->addDay()) {
            $price = 40000 + $date->dayOfYear * 10;
            $rows[] = [
                'product_id' => $this->coffee->id,
                'region_id' => $this->dakLak->id,
                'price_source_id' => $source->id,
                'date' => $date->toDateString(),
                'price_min' => $price,
                'price_max' => $price,
                'price_avg' => $price,
                'unit' => 'kg',
                'status' => PriceStatus::Published->value,
                'created_at' => now(),
                'updated_at' => now(),
            ];
        }
        foreach (array_chunk($rows, 500) as $chunk) {
            Price::query()->insert($chunk);
        }
    }

    private function history(array $query = []): TestResponse
    {
        return $this->getJson(route('api.v1.prices.history', ['product' => 'ca-phe-robusta', 'region' => 'dak-lak', ...$query]));
    }

    public function test_guest_sees_only_last_10_days(): void
    {
        $this->history(['days' => 365])
            ->assertOk()
            ->assertJsonPath('from', '2026-10-06')
            ->assertJsonPath('interval', 'day')
            ->assertJsonCount(10, 'points')
            ->assertJsonPath('access', ['tier' => 'guest', 'max_days' => 10, 'limited' => true, 'first_date' => '2021-10-16']);
    }

    public function test_guest_cannot_read_old_prices_by_moving_to_date_back(): void
    {
        $this->history(['days' => 30, 'to' => '2024-01-31'])
            ->assertOk()
            ->assertJsonPath('points', [])
            ->assertJsonPath('access.limited', true);
    }

    public function test_registered_member_sees_last_30_days(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->history(['days' => 90])
            ->assertJsonPath('from', '2026-09-16')
            ->assertJsonCount(30, 'points')
            ->assertJsonPath('access.tier', 'member')
            ->assertJsonPath('access.limited', true);

        $this->history(['days' => 7])->assertJsonCount(7, 'points')->assertJsonPath('access.limited', false);
    }

    public function test_premium_sees_full_history_grouped_by_week_or_month(): void
    {
        Sanctum::actingAs(User::factory()->premium()->create());

        $year = $this->history(['days' => 365])->assertJsonPath('access.tier', 'premium')->assertJsonPath('access.limited', false)->assertJsonPath('interval', 'week');
        $this->assertEqualsWithDelta(53, count($year->json('points')), 1);
        $this->assertSame('2025-10-13', $year->json('points.0.date'), 'Điểm tuần đặt ở ngày Thứ 2');

        $all = $this->history(['days' => 1827])->assertJsonPath('interval', 'month')->assertJsonPath('from', '2021-10-15');
        $this->assertCount(61, $all->json('points'));
        $this->assertSame('2021-10-01', $all->json('points.0.date'));
    }

    public function test_expired_plan_falls_back_to_member(): void
    {
        Sanctum::actingAs(User::factory()->create(['premium_until' => now()->subDay()]));

        $this->history(['days' => 365])->assertJsonPath('access.tier', 'member')->assertJsonCount(30, 'points');
    }

    public function test_extend_premium_adds_months_to_current_end(): void
    {
        $user = User::factory()->create();
        $user->extendPremium(1);
        $this->assertSame('2026-11-15', $user->premium_until->toDateString());

        $user->extendPremium(12);
        $this->assertSame('2027-11-15', $user->premium_until->toDateString());
    }

    public function test_plans_and_limits_are_listed_and_user_shows_tier(): void
    {
        $this->seed(PlanSeeder::class);
        Plan::factory()->create(['code' => 'cu', 'is_active' => false]);

        $this->getJson(route('api.v1.plans.index'))
            ->assertOk()
            ->assertJsonPath('data.*.code', ['thang', 'nam'])
            ->assertJsonPath('data.1.price', 199000)
            ->assertJsonPath('limits', ['guest_days' => 10, 'member_days' => 30]);

        Sanctum::actingAs(User::factory()->premium()->create());
        $this->getJson(route('api.v1.user'))->assertJsonPath('data.tier', 'premium')->assertJsonPath('data.premium_until', '2026-11-15');
    }
}
