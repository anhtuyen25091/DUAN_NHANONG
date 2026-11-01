<?php

namespace Tests\Feature;

use App\Models\Device;
use App\Models\FirmwareRelease;
use Database\Seeders\MetricSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * Cập nhật firmware qua mạng + cấu hình từ xa cho mạch ESP32.
 */
class FirmwareOtaTest extends TestCase
{
    use RefreshDatabase;

    private Device $device;

    private string $key;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(MetricSeeder::class);
        Storage::fake(FirmwareRelease::DISK);
        $this->device = Device::factory()->create(['firmware' => '1.0.0']);
        $this->key = $this->device->rotateKey();
    }

    private function ingest(string $firmware): array
    {
        return $this->postJson(route('api.v1.ingest.store'), ['firmware' => $firmware, 'readings' => [['metric' => 'soil_ph', 'value' => 6.4]]], ['Authorization' => "Bearer {$this->key}"])
            ->assertOk()
            ->json();
    }

    public function test_device_downloads_new_firmware_and_reports_installed(): void
    {
        Storage::disk(FirmwareRelease::DISK)->put('firmware/abc.bin', 'firmware-1.1.0-bytes');
        $release = FirmwareRelease::query()->create(['device_id' => $this->device->id, 'version' => '1.1.0', 'path' => 'firmware/abc.bin']);
        $this->assertSame(md5('firmware-1.1.0-bytes'), $release->md5);
        $this->assertSame(20, $release->size);

        $this->assertSame(['version' => '1.1.0', 'size' => 20, 'md5' => md5('firmware-1.1.0-bytes')], $this->ingest('1.0.0')['firmware_update']);

        $response = $this->get(route('api.v1.device.firmware'), ['Authorization' => "Bearer {$this->key}"])->assertOk();
        $this->assertSame(md5('firmware-1.1.0-bytes'), $response->headers->get('x-MD5'));
        $this->assertSame('firmware-1.1.0-bytes', $response->streamedContent());

        // Khởi động lại với bản mới: gửi số đo kèm version mới = đã cài, không báo cập nhật nữa
        $this->assertArrayNotHasKey('firmware_update', $this->ingest('1.1.0'));
        $this->assertNotNull($release->fresh()->installed_at);
        $this->get(route('api.v1.device.firmware'), ['Authorization' => "Bearer {$this->key}"])->assertNotFound();
    }

    public function test_firmware_of_other_device_is_not_offered(): void
    {
        $other = Device::factory()->create();
        Storage::disk(FirmwareRelease::DISK)->put('firmware/other.bin', 'x');
        FirmwareRelease::query()->create(['device_id' => $other->id, 'version' => '2.0.0', 'path' => 'firmware/other.bin']);

        $this->assertArrayNotHasKey('firmware_update', $this->ingest('1.0.0'));
        $this->get(route('api.v1.device.firmware'), ['Authorization' => "Bearer {$this->key}"])->assertNotFound();
        $this->get(route('api.v1.device.firmware'))->assertUnauthorized();
    }

    public function test_measure_interval_is_sent_as_remote_config(): void
    {
        $this->assertArrayNotHasKey('config', $this->ingest('1.0.0'));

        $this->device->update(['measure_interval_min' => 30]);

        $this->assertSame(['measure_interval_min' => 30], $this->ingest('1.0.0')['config']);
        $this->getJson(route('api.v1.device.commands'), ['Authorization' => "Bearer {$this->key}"])->assertJsonPath('config.measure_interval_min', 30);
    }
}
