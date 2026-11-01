<?php

namespace Tests\Feature;

use App\Enums\PlotType;
use App\Enums\ReadingSource;
use App\Models\Device;
use App\Models\Farm;
use App\Models\Plot;
use App\Models\User;
use App\Services\ReadingIngestor;
use Database\Seeders\MetricSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RainTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private Farm $farm;

    /** Mưa 15 phút gần nhất mà Open-Meteo giả trả về */
    private float $currentRain = 0;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(MetricSeeder::class);
        Carbon::setTestNow('2026-11-01 14:20:00');
        Http::fake([
            // Mẫu archive phải đứng trước: "api.open-meteo.com/*" cũng khớp archive-api.open-meteo.com
            'archive-api.open-meteo.com/*' => Http::response($this->archive()),
            'api.open-meteo.com/*' => fn (Request $request) => isset($request->data()['current'])
                ? Http::response(['current' => ['time' => now()->format('Y-m-d\TH:i'), 'interval' => 900, 'precipitation' => $this->currentRain]])
                : Http::response($this->hourly()),
            'exp.host/*' => Http::response(['data' => [['status' => 'ok']]]),
        ]);

        $this->user = User::factory()->create();
        $this->user->pushTokens()->create(['token' => 'ExponentPushToken[abc]']);
        // Vườn ở Cư Bao, Đắk Lắk (12°50'22.3"N 108°15'26.1"E): có vị trí thì tự lấy lượng mưa 1 năm
        $this->farm = Farm::factory()->for($this->user)->create(['name' => 'Vườn Cư Bao', 'lat' => 12.83953, 'lng' => 108.25725]);
        Plot::factory()->for($this->farm)->create(['name' => 'Vườn A', 'type' => PlotType::Garden]);
    }

    public function test_new_location_backfills_one_year_of_daily_rain(): void
    {
        // Ngày đã qua từ API lưu trữ; hôm nay cộng các giờ đã qua (00:00 → 14:00: 15 giờ, giờ 13 mưa 2 mm)
        $rain = fn (string $date) => DB::table('farm_rain_daily')->where('farm_id', $this->farm->id)->where('date', $date)->value('rain_mm');
        $this->assertSame(364, DB::table('farm_rain_daily')->where('farm_id', $this->farm->id)->count());
        $this->assertEquals(16.0, $rain('2026-11-01'));
        $this->assertEquals(3.5, $rain('2025-11-02'));
        // API lưu trữ chưa có 31/10: lấy từ API dự báo vì đủ 24 giờ
        $this->assertEquals(24.0, $rain('2026-10-31'));
        // API lưu trữ chưa có 30/10, API dự báo thiếu giờ: bỏ trống, không ghi 0
        $this->assertNull($rain('2026-10-30'));
        Http::assertSent(fn (Request $request) => str_contains($request->url(), 'archive-api') && $request['start_date'] === '2025-11-02' && $request['end_date'] === '2026-10-31');
    }

    public function test_free_account_sees_30_days_premium_sees_365(): void
    {
        Sanctum::actingAs($this->user);

        $this->getJson(route('api.v1.farms.rainfall', [$this->farm, 'days' => 365]))
            ->assertOk()
            ->assertJsonPath('days', 30)
            ->assertJsonPath('data.27.rain_mm', null)
            ->assertJsonPath('max_days', 30)
            ->assertJsonPath('locked', true)
            ->assertJsonPath('plan.premium', false)
            ->assertJsonCount(30, 'data')
            ->assertJsonPath('data.29.date', '2026-11-01')
            ->assertJsonPath('data.29.rain_mm', 16)
            // 27 ngày × 3,5 mm (lưu trữ) + 24 mm (31/10) + 16 mm hôm nay; 30/10 không có số liệu
            ->assertJsonPath('total_mm', 134.5)
            ->assertJsonPath('rainy_days', 29);

        $this->user->forceFill(['nhanong_user_id' => 7, 'nhanong_token' => 'tok', 'nhanong_tier' => 'premium', 'premium_until' => '2027-06-30', 'plan_checked_at' => now()])->save();

        $this->getJson(route('api.v1.farms.rainfall', [$this->farm, 'days' => 365]))
            ->assertOk()
            ->assertJsonPath('days', 365)
            ->assertJsonPath('locked', false)
            ->assertJsonPath('plan.premium', true)
            ->assertJsonCount(365, 'data');
    }

    public function test_link_nhanong_account_uses_its_plan(): void
    {
        $tier = 'premium';
        Http::fake(['127.0.0.1:8000/api/v1/user' => function (Request $request) use (&$tier) {
            return $request->header('Authorization')[0] === 'Bearer good'
                ? Http::response(['data' => ['id' => 12, 'phone' => '0900000099', 'tier' => $tier, 'premium_until' => $tier === 'premium' ? '2027-01-31' : null]])
                : Http::response(['message' => 'Unauthenticated.'], 401);
        }]);
        Sanctum::actingAs($this->user);

        $this->putJson(route('api.v1.nhanong.link'), ['token' => 'bad'])->assertJsonValidationErrors('token');
        Http::assertSent(fn (Request $request) => $request->url() === 'http://127.0.0.1:8000/api/v1/user');
        $this->putJson(route('api.v1.nhanong.link'), ['token' => 'good'])
            ->assertOk()
            ->assertJsonPath('data.linked', true)
            ->assertJsonPath('data.phone', '0900000099')
            ->assertJsonPath('data.premium', true)
            ->assertJsonPath('data.rain_history_days', 365);

        // 1 tài khoản Nhà Nông chỉ nối với 1 tài khoản cảm biến
        Sanctum::actingAs(User::factory()->create());
        $this->putJson(route('api.v1.nhanong.link'), ['token' => 'good'])->assertJsonValidationErrors('token');

        // Gói hết hạn: lần hỏi lại sau 6 giờ thấy hết gói
        Sanctum::actingAs($this->user);
        $tier = 'member';
        Carbon::setTestNow('2026-11-01 21:00:00');
        $this->getJson(route('api.v1.me'))->assertJsonPath('data.plan.premium', false)->assertJsonPath('data.plan.rain_history_days', 30);

        $this->deleteJson(route('api.v1.nhanong.unlink'))->assertOk()->assertJsonPath('data.linked', false);
    }

    public function test_rain_watch_alerts_once_per_rain(): void
    {
        $this->currentRain = 1.2;
        $this->artisan('weather:rain-watch')->assertSuccessful();
        $this->artisan('weather:rain-watch')->assertSuccessful();

        $pushes = Http::recorded(fn (Request $request) => str_contains($request->url(), 'exp.host'))->values();
        $this->assertCount(1, $pushes);
        $this->assertSame('🌧️ Vườn Cư Bao đang mưa', $pushes[0][0]['0']['title']);
        $this->assertStringStartsWith('Khoảng 4,8 mm/giờ', $pushes[0][0]['0']['body']);
        $this->assertSame($this->farm->id, $pushes[0][0]['0']['data']['iotFarmId']);
        $this->assertSame($this->farm->name, $pushes[0][0]['0']['data']['iotFarmName']);

        $farm = $this->farm->fresh();
        $this->assertNotNull($farm->raining_since);
        $this->assertSame(2.4, $farm->rain_episode_mm);

        Sanctum::actingAs($this->user);
        $this->getJson(route('api.v1.farms.index'))->assertJsonPath('data.0.raining.mm', 2.4);
    }

    public function test_rain_ends_after_dry_hour_and_new_rain_respects_cooldown(): void
    {
        $this->currentRain = 0.5;
        $this->artisan('weather:rain-watch');

        // Tạnh 30 phút: vẫn tính là cùng cơn mưa
        $this->currentRain = 0;
        Carbon::setTestNow('2026-11-01 14:50:00');
        $this->farm->forceFill(['last_rain_at' => now()->subMinutes(30)])->save();
        $this->artisan('weather:rain-watch');
        $this->assertNotNull($this->farm->fresh()->raining_since);

        // Tạnh hơn 1 giờ: hết cơn
        $this->farm->forceFill(['last_rain_at' => now()->subMinutes(70)])->save();
        $this->artisan('weather:rain-watch');
        $this->assertNull($this->farm->fresh()->raining_since);

        // Mưa lại sau 1 giờ (chưa qua 3 giờ): không báo dồn
        $this->currentRain = 0.8;
        $this->artisan('weather:rain-watch');
        $this->assertCount(1, Http::recorded(fn (Request $request) => str_contains($request->url(), 'exp.host'))->values());
    }

    public function test_rain_alerts_can_be_turned_off(): void
    {
        $this->farm->update(['rain_alerts' => false]);
        $this->currentRain = 2;
        $this->artisan('weather:rain-watch');

        $this->assertCount(0, Http::recorded(fn (Request $request) => str_contains($request->url(), 'exp.host'))->values());
        $this->assertNotNull($this->farm->fresh()->raining_since);
    }

    public function test_rain_gauge_alerts_with_plot_name_and_shows_in_history(): void
    {
        $gauge = Device::factory()->for($this->farm)->create(['name' => 'Máy đo mưa', 'plot_id' => $this->farm->plots()->value('id')]);

        app(ReadingIngestor::class)->ingest($gauge, [
            ['metric' => 'rainfall', 'value' => 0.6, 't' => now()->subMinutes(10)->getTimestamp()],
            ['metric' => 'rainfall', 'value' => 1.4, 't' => now()->subMinutes(5)->getTimestamp()],
        ], ReadingSource::Http);

        $pushes = Http::recorded(fn (Request $request) => str_contains($request->url(), 'exp.host'))->values();
        $this->assertCount(1, $pushes);
        $this->assertSame('🌧️ Vườn A (Vườn Cư Bao) đang mưa', $pushes[0][0]['0']['title']);
        $this->assertSame('Máy đo mưa "Máy đo mưa" ghi nhận 1,4 mm lúc 14:15.', $pushes[0][0]['0']['body']);

        $this->artisan('readings:rollup');
        Sanctum::actingAs($this->user);
        $this->getJson(route('api.v1.farms.rainfall', [$this->farm, 'days' => 7]))
            ->assertJsonPath('has_gauge', true)
            ->assertJsonPath('data.6.gauge_mm', 2)
            ->assertJsonPath('data.6.rain_mm', 16);
    }

    /**
     * 7 ngày qua + hôm nay, mỗi giờ 1 mm; 30/10 thiếu số liệu 1 giờ (null);
     * hôm nay giờ 13 mưa 2 mm, sau 14:00 là dự báo 50 mm (không được tính)
     *
     * @return array<string, mixed>
     */
    private function hourly(): array
    {
        $times = [];
        $rain = [];
        for ($t = Carbon::parse('2026-10-25 00:00'); $t->lt(Carbon::parse('2026-11-02 00:00')); $t->addHour()) {
            $times[] = $t->format('Y-m-d\TH:i');
            $rain[] = match (true) {
                $t->format('Y-m-d H') === '2026-10-30 05' => null,
                $t->format('Y-m-d H') === '2026-11-01 13' => 2.0,
                $t->gt(Carbon::parse('2026-11-01 14:00')) => 50.0,
                default => 1.0,
            };
        }

        return ['hourly' => ['time' => $times, 'precipitation' => $rain]];
    }

    /**
     * @return array<string, mixed>
     */
    private function archive(): array
    {
        $times = [];
        $rain = [];
        for ($t = Carbon::parse('2025-11-02'); $t->lte(Carbon::parse('2026-10-31')); $t->addDay()) {
            $times[] = $t->toDateString();
            // 2 ngày gần nhất API lưu trữ chưa có số liệu
            $rain[] = $t->gte(Carbon::parse('2026-10-30')) ? null : 3.5;
        }

        return ['daily' => ['time' => $times, 'precipitation_sum' => $rain]];
    }
}
