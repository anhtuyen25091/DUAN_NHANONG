<?php

namespace Tests\Feature;

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
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class DeviceHealthTest extends TestCase
{
    use RefreshDatabase;

    private Device $device;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(MetricSeeder::class);
        Carbon::setTestNow('2026-10-31 08:00:00');
        Http::fake(['exp.host/*' => Http::response(['data' => [['status' => 'ok']]])]);

        $user = User::factory()->create();
        $user->pushTokens()->create(['token' => 'ExponentPushToken[abc]']);
        $farm = Farm::factory()->for($user)->create();
        $plot = Plot::factory()->for($farm)->create(['name' => 'Ao tôm 1']);
        $this->device = Device::factory()->for($farm)->create(['plot_id' => $plot->id, 'name' => 'Đo nước ao 1']);
    }

    public function test_offline_device_notified_once_and_again_after_reconnect(): void
    {
        $this->device->forceFill(['last_seen_at' => now()->subHours(30)])->save();

        $this->artisan('devices:check-health')->assertSuccessful();
        $this->artisan('devices:check-health')->assertSuccessful();

        Http::assertSentCount(1);
        Http::assertSent(fn (Request $request) => $request['0']['title'] === 'Đo nước ao 1 (Ao tôm 1) mất kết nối'
            && str_contains($request['0']['body'], 'từ 02:00 30/10')
            && $request['0']['data']['iotDeviceId'] === $this->device->id);

        // Gửi số đo lại: lần mất kết nối sau báo tiếp
        app(ReadingIngestor::class)->ingest($this->device, [['metric' => 'water_ph', 'value' => 7.9]], ReadingSource::Http);
        $this->assertNull($this->device->fresh()->offline_notified_at);
    }

    public function test_never_seen_and_recent_devices_are_not_offline(): void
    {
        Device::factory()->for($this->device->farm)->create();
        $this->device->forceFill(['last_seen_at' => now()->subHours(2)])->save();

        $this->artisan('devices:check-health');

        Http::assertNothingSent();
    }

    public function test_low_battery_notified_once_until_recharged(): void
    {
        $ingest = fn (int $percent) => app(ReadingIngestor::class)->ingest($this->device, [['metric' => 'battery', 'value' => $percent]], ReadingSource::Http);

        $ingest(15);
        $this->artisan('devices:check-health');
        $ingest(14);
        $this->artisan('devices:check-health');
        Http::assertSentCount(1);
        Http::assertSent(fn (Request $request) => $request['0']['body'] === 'Pin còn 15%. Thay hoặc sạc pin để thiết bị không ngừng đo.');

        // Lên 25% chưa coi là đã sạc; lên 90% thì lần yếu pin sau báo tiếp
        $ingest(25);
        $this->assertNotNull($this->device->fresh()->low_battery_notified_at);
        $ingest(90);
        $this->assertNull($this->device->fresh()->low_battery_notified_at);
        $ingest(12);
        $this->artisan('devices:check-health');
        Http::assertSentCount(2);
    }
}
