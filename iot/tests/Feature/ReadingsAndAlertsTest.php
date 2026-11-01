<?php

namespace Tests\Feature;

use App\Enums\PlotType;
use App\Enums\ReadingSource;
use App\Models\Alert;
use App\Models\Device;
use App\Models\Farm;
use App\Models\Plot;
use App\Models\User;
use App\Services\ReadingIngestor;
use Database\Seeders\MetricSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReadingsAndAlertsTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private Plot $plot;

    private Device $device;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(MetricSeeder::class);
        Carbon::setTestNow('2026-10-28 15:00:00');

        $this->user = User::factory()->create();
        $farm = Farm::factory()->for($this->user)->create();
        $this->plot = Plot::factory()->for($farm)->create(['type' => PlotType::Pond, 'name' => 'Ao tôm 1']);
        $this->device = Device::factory()->for($farm)->create(['plot_id' => $this->plot->id, 'name' => 'Đo nước']);
        Sanctum::actingAs($this->user);
    }

    public function test_threshold_opens_and_auto_resolves_alert(): void
    {
        $this->postJson(route('api.v1.thresholds.store', $this->plot), ['metric' => 'salinity', 'max' => 4, 'note' => 'Lúa chịu tối đa 4‰'])->assertCreated();
        $this->postJson(route('api.v1.thresholds.store', $this->plot), ['metric' => 'water_ph', 'min' => 7.5, 'max' => 8.5])->assertCreated();

        $this->ingest([['salinity', 5.1, '14:00'], ['water_ph', 8.0, '14:00']]);
        $alert = Alert::query()->sole();
        $this->assertSame('above', $alert->direction->value);
        $this->assertSame(5.1, $alert->value);

        // Vẫn vượt: không mở thêm cảnh báo mới, chỉ cập nhật số đo
        $this->ingest([['salinity', 5.6, '14:15']]);
        $this->assertSame(1, Alert::query()->count());
        $this->assertSame(5.6, $alert->fresh()->value);

        $this->getJson(route('api.v1.alerts.index', ['open' => 1]))->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.metric.code', 'salinity');

        $this->ingest([['salinity', 3.2, '14:30']]);
        $this->assertNotNull($alert->fresh()->resolved_at);
        $this->getJson(route('api.v1.alerts.index', ['open' => 1]))->assertJsonCount(0, 'data');
    }

    public function test_old_backfilled_readings_do_not_raise_alerts(): void
    {
        $this->postJson(route('api.v1.thresholds.store', $this->plot), ['metric' => 'water_do', 'min' => 4])->assertCreated();

        // Mất mạng 2 ngày, gửi bù: số đo vẫn lưu nhưng không báo động muộn
        $result = app(ReadingIngestor::class)->ingest($this->device, [
            ['metric' => 'water_do', 'value' => 2.5, 't' => now()->subDays(2)->getTimestamp()],
        ], ReadingSource::Http);

        $this->assertSame(1, $result->accepted);
        $this->assertSame(0, Alert::query()->count());
    }

    public function test_backfill_older_than_latest_does_not_reopen_alert(): void
    {
        $this->postJson(route('api.v1.thresholds.store', $this->plot), ['metric' => 'water_ph', 'max' => 8.5])->assertCreated();

        $this->ingest([['water_ph', 8.0, '14:30']]);
        // Lô gửi bù đến sau, có số đo cũ hơn vượt ngưỡng
        $this->ingest([['water_ph', 9.0, '13:00']]);

        $this->assertSame(0, Alert::query()->count());
    }

    public function test_plot_summary_and_device_latest(): void
    {
        $this->postJson(route('api.v1.thresholds.store', $this->plot), ['metric' => 'water_ph', 'min' => 7.5, 'max' => 8.5]);
        $this->ingest([['water_ph', 7.2, '13:00'], ['water_ph', 7.9, '14:00'], ['water_temp', 29.4, '14:00']]);

        $this->getJson(route('api.v1.plots.summary', $this->plot))
            ->assertOk()
            ->assertJsonPath('data.plot.name', 'Ao tôm 1')
            ->assertJsonPath('data.devices.0.online', true)
            ->assertJsonPath('data.readings.0.metric.code', 'water_ph')
            ->assertJsonPath('data.readings.0.value', 7.9)
            ->assertJsonPath('data.readings.0.status', 'ok')
            ->assertJsonPath('data.readings.0.device_name', 'Đo nước')
            ->assertJsonPath('data.readings.1.metric.code', 'water_temp')
            ->assertJsonPath('data.readings.1.status', null);

        $this->getJson(route('api.v1.devices.latest', $this->device))->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_readings_raw_hourly_and_daily(): void
    {
        $this->ingest([['water_temp', 28, '13:00'], ['water_temp', 30, '13:30'], ['water_temp', 31, '14:10']]);

        $this->getJson(route('api.v1.devices.readings', [$this->device, 'metric' => 'water_temp']))
            ->assertOk()
            ->assertJsonPath('interval', 'raw')
            ->assertJsonCount(3, 'data')
            ->assertJsonPath('data.0.value', 28);

        $this->getJson(route('api.v1.devices.readings', [$this->device, 'metric' => 'water_temp', 'interval' => 'hour']))
            ->assertOk()
            ->assertJsonPath('data.0.avg', 29)
            ->assertJsonPath('data.0.min', 28)
            ->assertJsonPath('data.0.count', 2)
            ->assertJsonPath('data.1.avg', 31);

        $this->artisan('readings:rollup')->assertSuccessful();
        $this->assertSame(2, DB::table('reading_hourly')->count());

        $this->getJson(route('api.v1.devices.readings', [$this->device, 'metric' => 'water_temp', 'from' => '2026-10-01', 'interval' => 'day']))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.avg', 29.7)
            ->assertJsonPath('data.0.count', 3);
    }

    public function test_rollup_recomputes_hour_when_backfill_arrives(): void
    {
        $this->ingest([['water_temp', 28, '13:00']]);
        $this->artisan('readings:rollup');

        $this->ingest([['water_temp', 30, '13:45']]);
        $this->artisan('readings:rollup');

        $hour = DB::table('reading_hourly')->sole();
        $this->assertEquals(29, $hour->avg);
        $this->assertEquals(2, $hour->count);
    }

    public function test_prune_keeps_recent_readings(): void
    {
        app(ReadingIngestor::class)->ingest($this->device, [
            ['metric' => 'water_temp', 'value' => 28, 't' => now()->subDays(80)->getTimestamp()],
            ['metric' => 'water_temp', 'value' => 29, 't' => now()->subDay()->getTimestamp()],
        ], ReadingSource::Http);

        $this->artisan('readings:prune', ['--days' => 30])->assertSuccessful();
        $this->assertSame(1, $this->device->readings()->count());
    }

    public function test_simulate_with_offline_backfill(): void
    {
        $this->artisan('iot:simulate', ['device' => $this->device->uid, '--hours' => 6, '--interval' => 30, '--offline' => 2])
            ->expectsOutputToContain('gửi bù 1 lô')
            ->assertSuccessful();

        // 13 thời điểm × 6 chỉ số mặc định của ao
        $this->assertSame(78, $this->device->readings()->count());
    }

    /**
     * @param  list<array{0: string, 1: float, 2: string}>  $rows  [chỉ số, giá trị, giờ hôm nay]
     */
    private function ingest(array $rows): void
    {
        app(ReadingIngestor::class)->ingest($this->device, array_map(fn (array $row) => [
            'metric' => $row[0],
            'value' => $row[1],
            't' => Carbon::parse('2026-10-28 '.$row[2])->getTimestamp(),
        ], $rows), ReadingSource::Http);
    }
}
