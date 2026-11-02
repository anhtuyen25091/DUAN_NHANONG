<?php

namespace Tests\Feature;

use App\Enums\ActuatorKind;
use App\Enums\ReadingSource;
use App\Models\Actuator;
use App\Models\ActuatorCommand;
use App\Models\Alert;
use App\Models\Device;
use App\Models\Farm;
use App\Models\FarmMember;
use App\Models\Metric;
use App\Models\Plot;
use App\Models\PlotEvent;
use App\Models\User;
use App\Services\Control\CommandService;
use App\Services\Control\SprayPauseException;
use App\Services\ReadingIngestor;
use Database\Seeders\MetricSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Việc làm vườn: phun thuốc / bón phân / tưới trên lô và các phản ứng của hệ thống
 * (cấm vào lô, cách ly thu hoạch, tạm dừng tưới trên tán, ghi chú cảnh báo sau bón phân, tự ghi nhật ký tưới, nhắc việc).
 */
class FarmWorkTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private User $worker;

    private Farm $farm;

    private Plot $plot;

    private Device $controller;

    /** @var list<array{title: string, body: string}> */
    private array $pushes = [];

    /** @var array<string, mixed> dự báo Open-Meteo giả */
    private array $meteo = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(MetricSeeder::class);
        // Máy chủ chạy giờ Việt Nam
        Carbon::setTestNow('2026-11-02 08:00:00');
        Http::fake([
            'api.open-meteo.com/*' => fn () => Http::response($this->meteo),
            'exp.host/*' => function (Request $request) {
                $this->pushes[] = ['title' => $request->data()[0]['title'] ?? '', 'body' => $request->data()[0]['body'] ?? ''];

                return Http::response(['data' => [['status' => 'ok']]]);
            },
        ]);
        $this->fakeHttp(rain: fn (int $h) => 0.0, wind: 1.5, temp: 27);

        $this->owner = User::factory()->create(['name' => 'Chú Ba']);
        $this->owner->pushTokens()->create(['token' => 'ExponentPushToken[owner]']);
        $this->worker = User::factory()->create(['name' => 'Anh Tư']);
        $this->worker->pushTokens()->create(['token' => 'ExponentPushToken[worker]']);
        $this->farm = Farm::factory()->for($this->owner)->create(['name' => 'Vườn Cư Bao', 'lat' => 12.84, 'lng' => 108.26]);
        FarmMember::query()->create(['farm_id' => $this->farm->id, 'user_id' => $this->worker->id, 'role' => 'operator']);
        $this->plot = Plot::factory()->for($this->farm)->create(['name' => 'Lô sầu riêng A']);
        $this->controller = Device::factory()->for($this->farm)->create(['name' => 'Tủ bơm', 'plot_id' => $this->plot->id]);
    }

    public function test_worker_records_spray_and_everyone_sees_restrictions(): void
    {
        Sanctum::actingAs($this->worker);
        $this->postJson(route('api.v1.plot-events.store', $this->plot), [
            'kind' => 'spray', 'title' => 'Regent 800WG', 'quantity' => 2, 'unit' => 'gói', 'target' => 'sâu đục trái',
            'withholding_days' => 14, 'reentry_hours' => 24, 'rain_free_hours' => 4,
        ])
            ->assertCreated()
            ->assertJsonPath('data.user.name', 'Anh Tư')
            ->assertJsonPath('data.harvest_from', '2026-11-16')
            ->assertJsonPath('data.no_entry_until', '2026-11-03T08:00:00+07:00')
            ->assertJsonPath('data.canopy_paused_until', '2026-11-02T12:00:00+07:00');

        // Báo cả chủ lẫn người làm
        $this->assertCount(1, $this->pushes);
        $this->assertStringContainsString('vừa phun Regent 800WG', $this->pushes[0]['title']);
        $this->assertStringContainsString('Không vào lô tới 08:00 03/11', $this->pushes[0]['body']);
        $this->assertStringContainsString('Thu hoạch từ 16/11', $this->pushes[0]['body']);

        Sanctum::actingAs($this->owner);
        $this->getJson(route('api.v1.plots.summary', $this->plot))
            ->assertOk()
            ->assertJsonPath('data.plot.work.harvest_from', '2026-11-16')
            ->assertJsonPath('data.plot.work.harvest_event.title', 'Regent 800WG')
            ->assertJsonPath('data.plot.work.no_entry_until', '2026-11-03T08:00:00+07:00');
        $this->getJson(route('api.v1.farms.index'))->assertOk()->assertJsonPath('data.0.plots.0.work.harvest_from', '2026-11-16');

        // Phân bón không có cách ly / cấm vào
        $this->postJson(route('api.v1.plot-events.store', $this->plot), ['kind' => 'fertilize', 'title' => 'NPK 20-20-15', 'withholding_days' => 7])
            ->assertCreated()
            ->assertJsonPath('data.withholding_days', null);
    }

    public function test_permissions(): void
    {
        $viewer = User::factory()->create();
        FarmMember::query()->create(['farm_id' => $this->farm->id, 'user_id' => $viewer->id, 'role' => 'viewer']);
        $event = $this->plot->events()->create(['uuid' => Str::uuid(), 'user_id' => $this->owner->id, 'kind' => 'spray', 'title' => 'Thuốc A', 'done_at' => now()]);

        Sanctum::actingAs($viewer);
        $this->getJson(route('api.v1.plot-events.index', $this->plot))->assertOk()->assertJsonCount(1, 'data');
        $this->postJson(route('api.v1.plot-events.store', $this->plot), ['kind' => 'water', 'title' => 'Tưới'])->assertForbidden();

        // Người làm không xóa được việc người khác ghi
        Sanctum::actingAs($this->worker);
        $this->deleteJson(route('api.v1.plot-events.destroy', $event))->assertForbidden();

        Sanctum::actingAs(User::factory()->create());
        $this->getJson(route('api.v1.plot-events.index', $this->plot))->assertNotFound();

        Sanctum::actingAs($this->owner);
        $this->deleteJson(route('api.v1.plot-events.destroy', $event))->assertNoContent();
    }

    public function test_same_uuid_is_idempotent_and_deletions_sync(): void
    {
        Sanctum::actingAs($this->owner);
        $uuid = (string) Str::uuid();
        $body = ['uuid' => $uuid, 'kind' => 'fertilize', 'title' => 'Urê', 'quantity' => 50, 'unit' => 'kg', 'source' => 'ledger', 'done_at' => '2026-10-20'];
        $this->postJson(route('api.v1.plot-events.store', $this->plot), $body)->assertCreated();
        $this->postJson(route('api.v1.plot-events.store', $this->plot), ['quantity' => 60] + $body)->assertOk()->assertJsonPath('data.quantity', 60);
        $this->assertSame(1, PlotEvent::query()->count());
        // Nhật ký cũ từ Sổ thu chi: không báo đẩy
        $this->assertSame([], $this->pushes);

        // Sửa từ Sổ thu chi (không có giờ cấm vào lô, giờ làm khác trong cùng ngày): giữ những gì đã ghi trên lô
        $spray = ['uuid' => (string) Str::uuid(), 'kind' => 'spray', 'title' => 'Anvil', 'reentry_hours' => 24, 'rain_free_hours' => 4, 'done_at' => '2026-11-02T07:15:00+07:00'];
        $this->postJson(route('api.v1.plot-events.store', $this->plot), $spray)->assertCreated();
        $this->postJson(route('api.v1.plot-events.store', $this->plot), ['quantity' => 2, 'reentry_hours' => null, 'rain_free_hours' => null, 'done_at' => '2026-11-02T01:30:00Z', 'source' => 'ledger'] + $spray)
            ->assertOk()
            ->assertJsonPath('data.quantity', 2)
            ->assertJsonPath('data.reentry_hours', 24)
            ->assertJsonPath('data.done_at', '2026-11-02T07:15:00+07:00');
        PlotEvent::query()->where('uuid', $spray['uuid'])->forceDelete();

        // Giờ UTC từ máy: lưu đúng giờ Việt Nam; ?since= dạng UTC cũng so đúng
        $utc = ['uuid' => (string) Str::uuid(), 'kind' => 'water', 'title' => 'Tưới gốc', 'done_at' => '2026-11-02T00:30:00Z'];
        $this->postJson(route('api.v1.plot-events.store', $this->plot), $utc)->assertCreated()->assertJsonPath('data.done_at', '2026-11-02T07:30:00+07:00');
        $this->travel(10)->minutes();
        $this->getJson(route('api.v1.plot-events.index', ['plot' => $this->plot, 'since' => now()->utc()->subMinutes(5)->toIso8601ZuluString()]))->assertJsonCount(0, 'data');
        $this->getJson(route('api.v1.plot-events.index', ['plot' => $this->plot, 'since' => now()->utc()->subMinutes(15)->toIso8601ZuluString()]))->assertJsonFragment(['uuid' => $utc['uuid']]);
        PlotEvent::query()->where('uuid', $utc['uuid'])->forceDelete();

        $id = PlotEvent::query()->value('id');
        $this->deleteJson(route('api.v1.plot-events.destroy', $id))->assertNoContent();
        // Gửi lại uuid đã xóa: không hồi sinh, trả về deleted để máy xóa nhật ký theo
        $this->postJson(route('api.v1.plot-events.store', $this->plot), $body)->assertOk()->assertJsonPath('data.deleted', true);
        $this->getJson(route('api.v1.plot-events.index', ['plot' => $this->plot, 'since' => '2026-11-01T00:00:00Z']))
            ->assertOk()
            ->assertJsonPath('data.0.uuid', $uuid)
            ->assertJsonPath('data.0.deleted', true);
        $this->getJson(route('api.v1.plot-events.index', $this->plot))->assertOk()->assertJsonCount(0, 'data');

        // Sổ thu chi xóa nhật ký: máy chỉ biết uuid
        $other = (string) Str::uuid();
        $this->postJson(route('api.v1.plot-events.store', $this->plot), ['uuid' => $other, 'kind' => 'water', 'title' => 'Tưới gốc'])->assertCreated();
        $this->postJson(route('api.v1.plot-events.store', $this->plot), ['uuid' => $other, 'deleted' => true])->assertNoContent();
        $this->assertSoftDeleted('plot_events', ['uuid' => $other]);
        $this->postJson(route('api.v1.plot-events.store', $this->plot), ['uuid' => (string) Str::uuid(), 'deleted' => true])->assertNoContent();
    }

    public function test_canopy_irrigation_pauses_after_spray(): void
    {
        $sprinkler = $this->actuator('Béc phun trên tán', ActuatorKind::Pump, 1, Actuator::CANOPY);
        $mister = $this->actuator('Phun sương', ActuatorKind::Mister, 2, null);
        $drip = $this->actuator('Nhỏ giọt', ActuatorKind::Pump, 3, Actuator::ROOT);
        $unknown = $this->actuator('Bơm chưa khai báo', ActuatorKind::Pump, 4, null);
        $this->plot->events()->create(['uuid' => Str::uuid(), 'kind' => 'spray', 'title' => 'Anvil', 'rain_free_hours' => 4, 'done_at' => now()]);
        $commands = app(CommandService::class);

        // Lịch tưới / luật: luôn dừng
        foreach ([$sprinkler, $mister] as $actuator) {
            try {
                $commands->issue($actuator, ActuatorCommand::ON, 10, ActuatorCommand::SOURCE_SCHEDULE);
                $this->fail("{$actuator->name} phải bị tạm dừng");
            } catch (SprayPauseException $e) {
                $this->assertStringContainsString('chờ thuốc khô tới 12:00 02/11', $e->getMessage());
            }
        }
        $commands->issue($drip, ActuatorCommand::ON, 10, ActuatorCommand::SOURCE_SCHEDULE);
        $commands->issue($unknown, ActuatorCommand::ON, 10, ActuatorCommand::SOURCE_SCHEDULE);

        // Bật tay: hỏi lại, xác nhận thì cho bật
        Sanctum::actingAs($this->owner);
        $this->postJson(route('api.v1.actuators.command', $sprinkler), ['action' => 'on', 'minutes' => 5])
            ->assertStatus(409)
            ->assertJsonPath('code', 'spray_pause')
            ->assertJsonPath('until', '2026-11-02T12:00:00+07:00');
        $this->postJson(route('api.v1.actuators.command', $sprinkler), ['action' => 'on', 'minutes' => 5, 'force' => true])->assertCreated();
        $canopy = collect($this->getJson(route('api.v1.actuators.index', $this->plot))->assertOk()->json('data'))->pluck('wets_canopy', 'name');
        $this->assertEquals(['Béc phun trên tán' => true, 'Phun sương' => true, 'Nhỏ giọt' => false, 'Bơm chưa khai báo' => false], $canopy->all());

        // Hết giờ chờ khô
        Carbon::setTestNow('2026-11-02 12:01:00');
        $commands->issue($mister, ActuatorCommand::ON, 10, ActuatorCommand::SOURCE_RULE);
    }

    public function test_pump_run_is_logged_as_watering(): void
    {
        $pump = $this->actuator('Bơm giếng', ActuatorKind::Pump, 1, Actuator::ROOT);
        $aerator = $this->actuator('Quạt oxy', ActuatorKind::Aerator, 2, null);
        $commands = app(CommandService::class);

        $commands->acknowledge($commands->issue($pump, ActuatorCommand::ON, 30, ActuatorCommand::SOURCE_SCHEDULE), true);
        $commands->acknowledge($commands->issue($aerator, ActuatorCommand::ON, 30, ActuatorCommand::SOURCE_MANUAL), true);
        $commands->acknowledge($commands->issue($pump, ActuatorCommand::OFF, null, ActuatorCommand::SOURCE_MANUAL), true);

        $event = PlotEvent::query()->sole();
        $this->assertSame('water', $event->kind);
        $this->assertSame('Bơm giếng chạy 30 phút', $event->title);
        $this->assertSame('Tự ghi (lịch tưới)', $event->note);
        $this->assertSame(PlotEvent::SOURCE_ACTUATOR, $event->source);
        $this->assertSame(30, $event->minutes);
    }

    public function test_ec_alert_after_fertilizing_is_noted_and_not_pushed(): void
    {
        $sensor = Device::factory()->for($this->farm)->create(['name' => 'Cảm biến đất', 'plot_id' => $this->plot->id]);
        $this->plot->thresholds()->create(['metric_id' => Metric::byCode()['soil_ec']->id, 'max' => 1500]);
        $this->plot->thresholds()->create(['metric_id' => Metric::byCode()['soil_moisture']->id, 'min' => 20]);
        $this->plot->events()->create(['uuid' => Str::uuid(), 'kind' => 'fertilize', 'title' => 'NPK 16-16-8', 'done_at' => now()->subDay()]);

        $this->ingest($sensor, [['soil_ec', 2400], ['soil_moisture', 12]]);

        $ec = Alert::query()->whereHas('threshold.metric', fn ($q) => $q->where('code', 'soil_ec'))->sole();
        $this->assertSame('Có thể do vừa bón NPK 16-16-8 ngày 01/11', $ec->note);
        $moisture = Alert::query()->whereHas('threshold.metric', fn ($q) => $q->where('code', 'soil_moisture'))->sole();
        $this->assertNull($moisture->note);
        // Chỉ báo đẩy độ ẩm thấp
        $this->assertCount(1, $this->pushes);
        $this->assertStringContainsString('Độ ẩm đất', $this->pushes[0]['title']);

        Sanctum::actingAs($this->owner);
        $this->getJson(route('api.v1.alerts.index'))->assertOk()->assertJsonFragment(['note' => 'Có thể do vừa bón NPK 16-16-8 ngày 01/11']);
    }

    public function test_spray_advice_checks_rain_wind_and_heat(): void
    {
        Sanctum::actingAs($this->worker);
        $this->getJson(route('api.v1.plot-events.advice', ['plot' => $this->plot, 'kind' => 'spray']))
            ->assertOk()
            ->assertJsonPath('data.level', 'ok');

        // Mưa lúc 10:00 (2 giờ nữa), từ 14:00 khô ráo
        $this->fakeHttp(rain: fn (int $h) => $h === 10 ? 3.0 : 0.0, wind: 1.5, temp: 27);
        $this->getJson(route('api.v1.plot-events.advice', ['plot' => $this->plot, 'kind' => 'spray', 'rain_free_hours' => 4]))
            ->assertOk()
            ->assertJsonPath('data.level', 'avoid')
            ->assertJsonPath('data.items.0.text', 'Dự báo mưa khoảng 3 mm trong 4 giờ tới (thuốc cần khô 4 giờ): thuốc dễ bị rửa trôi.')
            ->assertJsonPath('data.best_time', '2026-11-02T11:00:00+07:00');

        // Mưa tới chiều tối: giờ phù hợp là sáng hôm sau, không gợi ý phun ban đêm
        $this->fakeHttp(rain: fn (int $h) => $h >= 9 && $h <= 20 ? 2.0 : 0.0, wind: 1.5, temp: 27);
        $this->getJson(route('api.v1.plot-events.advice', ['plot' => $this->plot, 'kind' => 'spray', 'rain_free_hours' => 4]))
            ->assertJsonPath('data.best_time', '2026-11-03T05:00:00+07:00');

        // Trạm thời tiết ở vườn đo gió mạnh, trời nóng
        $this->fakeHttp(rain: fn (int $h) => 0.0, wind: 1.0, temp: 34);
        $station = Device::factory()->for($this->farm)->create(['plot_id' => $this->plot->id]);
        $this->ingest($station, [['wind_speed', 6.2]]);
        $response = $this->getJson(route('api.v1.plot-events.advice', ['plot' => $this->plot, 'kind' => 'spray']))->assertOk();
        $response->assertJsonPath('data.level', 'avoid');
        $this->assertStringContainsString('Gió mạnh 6,2 m/s (trạm đo ở vườn)', $response->json('data.items.0.text'));
        $this->assertStringContainsString('Trời nóng 34°C', $response->json('data.items.1.text'));
    }

    public function test_route_limits_do_not_share_one_counter(): void
    {
        Sanctum::actingAs($this->owner);
        // Mở trang lô nhiều lần (nhóm 120 lần / phút) không làm khóa "kiểm tra trước khi làm" (30 lần / phút)
        for ($i = 0; $i < 40; $i++) {
            $this->getJson(route('api.v1.plot-events.index', $this->plot))->assertOk();
        }
        $this->getJson(route('api.v1.plot-events.advice', ['plot' => $this->plot, 'kind' => 'spray']))->assertOk();
    }

    public function test_fertilize_advice_checks_rain_and_dry_soil(): void
    {
        $this->fakeHttp(rain: fn (int $h) => $h >= 24 && $h < 30 ? 5.0 : 0.0, wind: 1, temp: 28);
        $this->plot->thresholds()->create(['metric_id' => Metric::byCode()['soil_moisture']->id, 'min' => 25]);
        $sensor = Device::factory()->for($this->farm)->create(['plot_id' => $this->plot->id]);
        $this->ingest($sensor, [['soil_moisture', 18]]);

        Sanctum::actingAs($this->owner);
        $response = $this->getJson(route('api.v1.plot-events.advice', ['plot' => $this->plot, 'kind' => 'fertilize']))->assertOk();
        $response->assertJsonPath('data.level', 'caution');
        $texts = collect($response->json('data.items'))->pluck('text');
        $this->assertTrue($texts->contains(fn ($t) => str_contains($t, 'mưa khoảng 30 mm trong 48 giờ tới')));
        $this->assertTrue($texts->contains(fn ($t) => str_contains($t, 'Đất đang khô (độ ẩm 18%')));
        $this->assertTrue($texts->contains('Bón xong nên tưới nhẹ cho phân tan, trừ khi sắp có mưa.'));
    }

    public function test_planned_work_is_reminded_and_marked_done(): void
    {
        Sanctum::actingAs($this->owner);
        $id = $this->postJson(route('api.v1.plot-events.store', $this->plot), [
            'kind' => 'spray', 'title' => 'Ridomil Gold', 'planned' => true, 'done_at' => '2026-11-02T16:00:00+07:00', 'withholding_days' => 7,
        ])->assertCreated()->assertJsonPath('data.harvest_from', null)->json('data.id');
        // Kế hoạch: chưa báo, chưa cách ly
        $this->assertSame([], $this->pushes);
        $this->getJson(route('api.v1.plots.summary', $this->plot))->assertJsonPath('data.plot.work.harvest_from', null)->assertJsonPath('data.plot.work.planned', 1);

        $this->artisan('farmwork:remind')->assertSuccessful();
        $this->artisan('farmwork:remind')->assertSuccessful();
        $this->assertCount(1, $this->pushes);
        $this->assertSame('📅 Hôm nay 16:00: phun Ridomil Gold (Lô sầu riêng A)', $this->pushes[0]['title']);

        // Bấm "Đã làm": tính từ bây giờ, báo mọi người
        Carbon::setTestNow('2026-11-02 09:30:00');
        $this->putJson(route('api.v1.plot-events.update', $id), ['kind' => 'spray', 'title' => 'Ridomil Gold', 'planned' => false, 'withholding_days' => 7])
            ->assertOk()
            ->assertJsonPath('data.done_at', '2026-11-02T09:30:00+07:00')
            ->assertJsonPath('data.harvest_from', '2026-11-09');
        $this->assertCount(2, $this->pushes);
    }

    private function actuator(string $name, ActuatorKind $kind, int $channel, ?string $mode): Actuator
    {
        return $this->controller->actuators()->create(['name' => $name, 'kind' => $kind, 'irrigation_mode' => $mode, 'channel' => $channel, 'plot_id' => $this->plot->id, 'max_minutes' => 60]);
    }

    /**
     * @param  list<array{0: string, 1: float}>  $rows
     */
    private function ingest(Device $device, array $rows): void
    {
        app(ReadingIngestor::class)->ingest($device, array_map(fn (array $row) => ['metric' => $row[0], 'value' => $row[1], 't' => now()->getTimestamp()], $rows), ReadingSource::Http);
    }

    /**
     * Dự báo 3 ngày từ 00:00 02/11 (giờ Việt Nam). rain($h): mưa giờ thứ h (0 = 00:00 02/11).
     */
    private function fakeHttp(\Closure $rain, float $wind, float $temp): void
    {
        $hours = collect(range(0, 71));
        $time = fn (int $h) => Carbon::parse('2026-11-02 00:00')->addHours($h)->format('Y-m-d\TH:i');
        $payload = [
            'daily' => [
                'time' => ['2026-11-02', '2026-11-03', '2026-11-04'],
                'weather_code' => [1, 1, 1],
                'temperature_2m_max' => [$temp, $temp, $temp],
                'temperature_2m_min' => [22, 22, 22],
                'precipitation_sum' => [0, 0, 0],
                'precipitation_probability_max' => [10, 10, 10],
                'wind_speed_10m_max' => [$wind, $wind, $wind],
            ],
            'hourly' => [
                'time' => $hours->map($time)->all(),
                'precipitation' => $hours->map($rain)->all(),
                'precipitation_probability' => $hours->map(fn (int $h) => $rain($h) > 0 ? 90 : 10)->all(),
                'wind_speed_10m' => $hours->map(fn () => $wind)->all(),
                'temperature_2m' => $hours->map(fn () => $temp)->all(),
            ],
        ];
        $this->meteo = $payload;
        cache()->flush();
    }
}
