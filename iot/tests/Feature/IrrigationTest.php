<?php

namespace Tests\Feature;

use App\Enums\ActuatorKind;
use App\Enums\PlotType;
use App\Enums\ReadingSource;
use App\Jobs\SyncFarmRain;
use App\Models\Actuator;
use App\Models\ActuatorCommand;
use App\Models\ActuatorSchedule;
use App\Models\Device;
use App\Models\Farm;
use App\Models\Plot;
use App\Models\User;
use App\Services\ReadingIngestor;
use Database\Seeders\MetricSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class IrrigationTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private Farm $farm;

    private Plot $garden;

    private Device $controller;

    /** Cảm biến đo độ mặn kênh cấp nước (không thuộc lô nào) */
    private Device $canal;

    private Actuator $pump;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(MetricSeeder::class);
        Carbon::setTestNow('2026-12-05 04:00:00');
        Bus::fake([SyncFarmRain::class]);
        Http::fake([
            'exp.host/*' => Http::response(['data' => [['status' => 'ok']]]),
            'api.open-meteo.com/*' => Http::response($this->forecast()),
        ]);

        $this->user = User::factory()->create();
        $this->user->pushTokens()->create(['token' => 'ExponentPushToken[abc]']);
        $this->farm = Farm::factory()->for($this->user)->create(['name' => 'Vườn Cư Bao', 'lat' => 12.84, 'lng' => 108.26]);
        $this->garden = Plot::factory()->for($this->farm)->create(['type' => PlotType::Garden, 'name' => 'Vườn A']);
        $this->controller = Device::factory()->for($this->farm)->create(['plot_id' => $this->garden->id, 'name' => 'Tủ bơm']);
        $this->canal = Device::factory()->for($this->farm)->create(['name' => 'Đo nước kênh']);
        $this->pump = $this->controller->actuators()->create(['name' => 'Bơm tưới', 'kind' => ActuatorKind::Pump, 'channel' => 1, 'plot_id' => $this->garden->id, 'max_minutes' => 90]);
        Sanctum::actingAs($this->user);
    }

    public function test_schedule_runs_at_its_time_and_repeats_every_n_days(): void
    {
        $id = $this->postJson(route('api.v1.schedules.store', $this->pump), [
            'start_time' => '05:30', 'minutes' => 40, 'every_days' => 20, 'months' => [12, 1, 2, 3, 4], 'skip_rain_mm' => 10, 'note' => 'Tưới gốc mùa khô',
        ])->assertCreated()->assertJsonPath('data.next_run_on', '2026-12-05')->json('data.id');
        $this->postJson(route('api.v1.schedules.store', $this->pump), ['start_time' => '05:30', 'minutes' => 120, 'every_days' => 1])->assertJsonValidationErrors('minutes');

        $this->travelTo('2026-12-05 05:29:00');
        $this->artisan('schedules:run');
        $this->assertSame(0, ActuatorCommand::query()->count());

        $this->travelTo('2026-12-05 05:30:00');
        $this->artisan('schedules:run')->expectsOutputToContain('Bật 1 lượt');
        $command = ActuatorCommand::query()->sole();
        $this->assertSame(['on', 40, 'schedule', 'Lịch tưới 05:30'], [$command->action, $command->minutes, $command->source, $command->reason]);
        $this->assertSame('2026-12-25', ActuatorSchedule::find($id)->next_run_on->toDateString());

        $this->artisan('schedules:run');
        $this->assertSame(1, ActuatorCommand::query()->count());
        $this->getJson(route('api.v1.schedules.index', $this->garden))->assertJsonPath('data.0.actuator.name', 'Bơm tưới')->assertJsonPath('data.0.months', [12, 1, 2, 3, 4]);
    }

    public function test_out_of_season_waits_and_missed_day_runs_once(): void
    {
        $schedule = $this->pump->schedules()->create(['start_time' => '05:30', 'minutes' => 30, 'every_days' => 10, 'months' => [1, 2, 3], 'next_run_on' => '2026-12-05']);

        // Tháng 12 không thuộc mùa của lịch: dời sang ngày mai, không bật
        $this->travelTo('2026-12-05 06:00:00');
        $this->artisan('schedules:run');
        $this->assertSame(0, ActuatorCommand::query()->count());
        $this->assertSame('2026-12-06', $schedule->fresh()->next_run_on->toDateString());

        // Máy chủ tắt 3 ngày (đúng mùa): chạy bù 1 lần, lượt sau tính từ hôm nay
        $schedule->update(['next_run_on' => '2027-01-02']);
        $this->travelTo('2027-01-05 04:00:00');
        $this->artisan('schedules:run');
        $this->assertSame(1, ActuatorCommand::query()->count());
        $this->assertSame('2027-01-15', $schedule->fresh()->next_run_on->toDateString());
    }

    public function test_months_from_admin_checkboxes_are_numbers(): void
    {
        // Ô chọn tháng của trang quản trị gửi chuỗi
        $schedule = $this->pump->schedules()->create(['start_time' => '05:30', 'minutes' => 30, 'every_days' => 1, 'months' => ['12', '1'], 'next_run_on' => '2026-12-05']);

        $this->assertSame([12, 1], $schedule->fresh()->months);
        $this->assertTrue($schedule->fresh()->inSeason(12));
        $this->assertNull($this->pump->schedules()->create(['start_time' => '06:00', 'minutes' => 30, 'every_days' => 1, 'months' => [], 'next_run_on' => '2026-12-05'])->fresh()->months);
    }

    public function test_schedule_skipped_after_enough_rain(): void
    {
        $schedule = $this->pump->schedules()->create(['start_time' => '05:30', 'minutes' => 30, 'every_days' => 7, 'skip_rain_mm' => 10, 'next_run_on' => '2026-12-05']);
        DB::table('farm_rain_daily')->insert(['farm_id' => $this->farm->id, 'date' => '2026-12-04', 'rain_mm' => 12.5]);

        $this->travelTo('2026-12-05 05:31:00');
        $this->artisan('schedules:run')->expectsOutputToContain('bỏ 1 lượt');

        $this->assertSame(0, ActuatorCommand::query()->count());
        $this->assertSame('2026-12-12', $schedule->fresh()->next_run_on->toDateString());
        Http::assertSent(fn (Request $request) => str_contains($request->url(), 'exp.host')
            && $request['0']['title'] === '🌧️ Bỏ lượt tưới Bơm tưới'
            && str_starts_with($request['0']['body'], 'Từ hôm qua tới giờ vườn đã mưa khoảng 12,5 mm (ngưỡng bỏ lượt 10 mm)'));
    }

    public function test_salty_water_blocks_pump_and_turns_it_off_while_running(): void
    {
        $this->putJson(route('api.v1.actuators.update', $this->pump), [
            'name' => 'Bơm tưới', 'kind' => 'pump', 'channel' => 1, 'max_minutes' => 90,
            'block_device_id' => $this->canal->id, 'block_metric' => 'salinity', 'block_operator' => 'above', 'block_value' => 0.3,
        ])->assertOk()->assertJsonPath('data.block.metric', 'salinity')->assertJsonPath('data.block.device_name', 'Đo nước kênh');

        // Nước ngọt: bật được
        $this->measureSalinity(0.2);
        $this->postJson(route('api.v1.actuators.command', $this->pump), ['action' => 'on', 'minutes' => 30])->assertCreated();
        $this->pump->forceFill(['is_on' => true])->save();

        // Đang bơm thì mặn lên: tự tắt, báo
        $this->measureSalinity(0.6);
        $off = ActuatorCommand::query()->latest('id')->first();
        $this->assertSame(['off', 'safety'], [$off->action, $off->source]);
        $this->assertSame('Độ mặn 0,6 ‰ > 0,3 ‰ (Đo nước kênh)', $off->reason);
        Http::assertSent(fn (Request $request) => str_contains($request->url(), 'exp.host') && $request['0']['title'] === '⛔ Đã tự tắt Bơm tưới');

        // Còn mặn: không cho bật tay, lịch tưới cũng bị chặn
        $this->pump->forceFill(['is_on' => false])->save();
        $this->postJson(route('api.v1.actuators.command', $this->pump), ['action' => 'on'])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Không bật Bơm tưới: Độ mặn 0,6 ‰ > 0,3 ‰ (Đo nước kênh).');
        $this->pump->schedules()->create(['start_time' => '05:30', 'minutes' => 30, 'every_days' => 1, 'next_run_on' => '2026-12-05']);
        $this->travelTo('2026-12-05 05:31:00');
        $this->artisan('schedules:run');
        Http::assertSent(fn (Request $request) => str_contains($request->url(), 'exp.host') && $request['0']['title'] === '⛔ Chặn bật Bơm tưới');

        // Số đo mặn đã cũ (> 12 giờ, cảm biến hỏng?): không chặn mù
        $this->travelTo('2026-12-05 20:00:00');
        $this->postJson(route('api.v1.actuators.command', $this->pump), ['action' => 'on'])->assertCreated();
    }

    public function test_dry_spell_reminder_with_forecast(): void
    {
        // 9 ngày gần nhất mưa dưới 1 mm, trước đó mưa to
        $this->rainDays(['2026-11-25' => 15, '2026-11-26' => 0.4, '2026-11-27' => 0, '2026-11-28' => 0, '2026-11-29' => 0.2, '2026-11-30' => 0, '2026-12-01' => 0, '2026-12-02' => 0, '2026-12-03' => 0, '2026-12-04' => 0]);
        $this->travelTo('2026-12-05 07:00:00');

        $this->getJson(route('api.v1.farms.index'))->assertJsonPath('data.0.dry_days', 9)->assertJsonPath('data.0.dry_alert_days', 7);

        $this->artisan('weather:dry-spell')->expectsOutputToContain('Đã nhắc 1');
        Http::assertSent(fn (Request $request) => str_contains($request->url(), 'exp.host')
            && $request['0']['title'] === '☀️ Vườn Cư Bao đã 9 ngày không mưa'
            && $request['0']['body'] === 'Tổng mưa 9 ngày qua 0,6 mm. Dự báo 3 ngày tới: hầu như không mưa. Kiểm tra độ ẩm đất, cân nhắc tưới.');

        // Cùng ngày / 2 ngày sau: không nhắc lại; 3 ngày sau còn khô thì nhắc tiếp
        $this->artisan('weather:dry-spell')->expectsOutputToContain('Đã nhắc 0');
        $this->rainDays(['2026-12-05' => 0, '2026-12-06' => 0, '2026-12-07' => 0]);
        $this->travelTo('2026-12-07 07:00:00');
        $this->artisan('weather:dry-spell')->expectsOutputToContain('Đã nhắc 0');
        $this->travelTo('2026-12-08 07:00:00');
        $this->artisan('weather:dry-spell')->expectsOutputToContain('Đã nhắc 1');

        // Mưa lại: hết đợt khô; tắt nhắc thì không nhắc
        $this->rainDays(['2026-12-08' => 8]);
        $this->travelTo('2026-12-09 07:00:00');
        $this->artisan('weather:dry-spell');
        $this->assertNull($this->farm->fresh()->dry_alerted_at);
        $this->putJson(route('api.v1.farms.update', $this->farm), ['name' => 'Vườn Cư Bao', 'dry_alert_days' => 0])->assertJsonPath('data.dry_alert_days', 0);
    }

    public function test_crop_presets_with_sources_and_apply_to_plot(): void
    {
        $presets = $this->getJson(route('api.v1.crop-presets.index'))->assertOk()->json('data');
        $this->assertSame(['ca-phe-voi', 'ho-tieu', 'sau-rieng'], array_column($presets, 'code'));
        foreach ($presets as $preset) {
            $this->assertNotEmpty($preset['sources'], "{$preset['code']} cần ghi nguồn");
        }
        $this->assertEqualsWithDelta(0.3, collect($presets)->firstWhere('code', 'sau-rieng')['interlock']['max'], 0.0001);

        $this->postJson(route('api.v1.crop-presets.apply', $this->garden), ['preset' => 'sau-rieng'])
            ->assertOk()
            ->assertJsonPath('thresholds.0.metric', 'soil_ph')
            ->assertJsonPath('thresholds.0.min', 5.5)
            ->assertJsonPath('thresholds.0.max', 6.5);
        $this->postJson(route('api.v1.crop-presets.apply', $this->garden), ['preset' => 'khong-co'])->assertJsonValidationErrors('preset');
    }

    private function measureSalinity(float $value): void
    {
        app(ReadingIngestor::class)->ingest($this->canal, [['metric' => 'salinity', 'value' => $value]], ReadingSource::Http);
        Carbon::setTestNow(now()->addSecond());
    }

    /**
     * @param  array<string, float>  $days
     */
    private function rainDays(array $days): void
    {
        foreach ($days as $date => $mm) {
            DB::table('farm_rain_daily')->updateOrInsert(['farm_id' => $this->farm->id, 'date' => $date], ['rain_mm' => $mm]);
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function forecast(): array
    {
        $days = collect(range(0, 6))->map(fn (int $i) => Carbon::parse('2026-12-05')->addDays($i)->toDateString());
        $hours = collect(range(0, 167))->map(fn (int $i) => Carbon::parse('2026-12-05 00:00')->addHours($i)->format('Y-m-d\TH:i'));

        return [
            'daily' => [
                'time' => $days->all(), 'weather_code' => array_fill(0, 7, 0), 'temperature_2m_max' => array_fill(0, 7, 31), 'temperature_2m_min' => array_fill(0, 7, 19),
                'precipitation_sum' => array_fill(0, 7, 0.1), 'precipitation_probability_max' => array_fill(0, 7, 5), 'wind_speed_10m_max' => array_fill(0, 7, 3),
            ],
            'hourly' => ['time' => $hours->all(), 'precipitation' => array_fill(0, 168, 0), 'precipitation_probability' => array_fill(0, 168, 0)],
        ];
    }
}
