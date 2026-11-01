<?php

namespace Tests\Feature;

use App\Models\Device;
use App\Models\Reading;
use Database\Seeders\FieldMapSeeder;
use Database\Seeders\MetricSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class LoRaWanWebhookTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed([MetricSeeder::class, FieldMapSeeder::class]);
        config(['iot.lorawan_secret' => 'lora-secret']);
        Carbon::setTestNow('2026-10-28 15:00:00');
    }

    public function test_secret_is_required(): void
    {
        $this->postJson(route('api.v1.lorawan.chirpstack'), $this->fixture('chirpstack-dragino-se01'))->assertUnauthorized();
        $this->postJson(route('api.v1.lorawan.ttn'), $this->fixture('ttn-milesight-em500-smtc'), ['X-Webhook-Secret' => 'sai'])->assertUnauthorized();
    }

    public function test_chirpstack_dragino_fields_are_mapped(): void
    {
        $device = Device::factory()->lorawan('A84041000181C27A', 'dragino-se01')->create();

        $this->postJson(route('api.v1.lorawan.chirpstack', ['event' => 'up']), $this->fixture('chirpstack-dragino-se01'), $this->headers())
            ->assertOk()
            ->assertJsonPath('accepted', 3);

        $this->assertEquals(['soil_ec' => 412.0, 'soil_moisture' => 38.42, 'soil_temp' => 27.31], $this->values($device));
        // Giờ đo lấy theo network server (UTC) đổi về giờ Việt Nam
        $this->assertSame('2026-10-28 14:15:00', Reading::query()->first()->measured_at->format('Y-m-d H:i:s'));
    }

    public function test_ttn_milesight_fields_are_mapped(): void
    {
        $device = Device::factory()->lorawan('24e124126b316403', 'milesight-em500-smtc')->create();

        $this->postJson(route('api.v1.lorawan.ttn'), $this->fixture('ttn-milesight-em500-smtc'), $this->headers())
            ->assertOk()
            ->assertJsonPath('accepted', 4);

        $this->assertEquals(['battery' => 92.0, 'soil_ec' => 306.0, 'soil_moisture' => 46.0, 'soil_temp' => 26.4], $this->values($device));
        $this->assertSame(92, $device->fresh()->battery);
    }

    public function test_generic_profile_accepts_metric_codes(): void
    {
        $device = Device::factory()->lorawan('0011223344556677')->create();
        $body = ['time' => '2026-10-28T07:00:00Z', 'deviceInfo' => ['devEui' => '0011223344556677'], 'object' => ['water_level' => 6.5, 'salinity' => 1.2, 'rssi' => -90, 'note' => 'x']];

        $this->postJson(route('api.v1.lorawan.chirpstack'), $body, $this->headers())->assertJsonPath('accepted', 2);
        $this->assertEquals(['salinity' => 1.2, 'water_level' => 6.5], $this->values($device));
    }

    public function test_unknown_device_and_other_events_are_ignored(): void
    {
        $this->postJson(route('api.v1.lorawan.chirpstack'), $this->fixture('chirpstack-dragino-se01'), $this->headers())->assertStatus(202);
        $this->postJson(route('api.v1.lorawan.chirpstack', ['event' => 'join']), ['deviceInfo' => ['devEui' => 'a84041000181c27a']], $this->headers())->assertNoContent();
        $this->assertSame(0, Reading::query()->count());
    }

    /**
     * @return array<string, mixed>
     */
    private function fixture(string $name): array
    {
        return json_decode(file_get_contents(base_path("tests/Fixtures/lorawan/{$name}.json")), true);
    }

    /**
     * @return array<string, string>
     */
    private function headers(): array
    {
        return ['X-Webhook-Secret' => 'lora-secret'];
    }

    /**
     * @return array<string, float>
     */
    private function values(Device $device): array
    {
        return Reading::query()->where('device_id', $device->id)->with('metric')->get()
            ->mapWithKeys(fn (Reading $reading) => [$reading->metric->code => $reading->value])
            ->sortKeys()
            ->all();
    }
}
