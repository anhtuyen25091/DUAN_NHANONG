<?php

namespace Tests\Feature;

use App\Models\Device;
use App\Models\Reading;
use Database\Seeders\MetricSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class IngestApiTest extends TestCase
{
    use RefreshDatabase;

    private Device $device;

    private string $key;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(MetricSeeder::class);
        $this->device = Device::factory()->create();
        $this->key = $this->device->rotateKey();
    }

    public function test_device_key_is_required(): void
    {
        $this->postJson(route('api.v1.ingest.store'), ['readings' => [['metric' => 'soil_ph', 'value' => 6]]])->assertUnauthorized();
        $this->postJson(route('api.v1.ingest.store'), ['readings' => [['metric' => 'soil_ph', 'value' => 6]]], ['Authorization' => 'Bearer ndk_sai'])->assertUnauthorized();
    }

    public function test_store_readings_with_device_time(): void
    {
        $t = now()->subHours(3)->startOfMinute();

        $this->postJson(route('api.v1.ingest.store'), [
            'firmware' => '1.2.0',
            'readings' => [
                ['metric' => 'soil_moisture', 'value' => 41.5, 't' => $t->getTimestamp()],
                ['metric' => 'soil_ph', 'value' => 6.4, 't' => $t->getTimestamp()],
                ['metric' => 'battery', 'value' => 78],
            ],
        ], $this->headers())
            ->assertOk()
            ->assertJsonPath('accepted', 3)
            ->assertJsonPath('duplicates', 0)
            ->assertJsonPath('rejected', []);

        $reading = Reading::query()->whereRelation('metric', 'code', 'soil_ph')->first();
        $this->assertSame(6.4, $reading->value);
        $this->assertTrue($reading->measured_at->eq($t));

        $device = $this->device->fresh();
        $this->assertSame('1.2.0', $device->firmware);
        $this->assertSame(78, $device->battery);
        $this->assertNotNull($device->last_seen_at);
    }

    public function test_resending_same_batch_is_not_duplicated(): void
    {
        $payload = ['readings' => [
            ['metric' => 'water_level', 'value' => 5.2, 't' => now()->subDay()->getTimestamp()],
            ['metric' => 'water_level', 'value' => 5.4, 't' => now()->subDay()->addMinutes(15)->getTimestamp()],
        ]];

        $this->postJson(route('api.v1.ingest.store'), $payload, $this->headers())->assertJsonPath('accepted', 2);
        $this->postJson(route('api.v1.ingest.store'), $payload, $this->headers())
            ->assertJsonPath('accepted', 0)
            ->assertJsonPath('duplicates', 2);

        $this->assertSame(2, Reading::query()->count());
    }

    public function test_invalid_rows_are_rejected_individually(): void
    {
        $this->postJson(route('api.v1.ingest.store'), ['readings' => [
            ['metric' => 'soil_ph', 'value' => 6.5],
            ['metric' => 'khong_co', 'value' => 1],
            ['metric' => 'soil_ph', 'value' => 19],
            ['metric' => 'soil_ph', 'value' => 'abc'],
            ['metric' => 'soil_ph', 'value' => 6, 't' => 0],
            ['metric' => 'soil_ph', 'value' => 6, 't' => now()->addDay()->getTimestamp()],
            ['metric' => 'soil_ph', 'value' => 6, 't' => now()->subDays(200)->getTimestamp()],
        ]], $this->headers())
            ->assertOk()
            ->assertJsonPath('accepted', 1)
            ->assertJsonPath('rejected', [
                ['index' => 1, 'reason' => 'unknown_metric'],
                ['index' => 2, 'reason' => 'out_of_range'],
                ['index' => 3, 'reason' => 'invalid_value'],
                ['index' => 4, 'reason' => 'invalid_time'],
                ['index' => 5, 'reason' => 'future_time'],
                ['index' => 6, 'reason' => 'too_old'],
            ]);
    }

    public function test_compact_csv(): void
    {
        $t = now()->subMinutes(30)->getTimestamp();
        $body = "t,metric,value\n{$t},salinity,3.8\n{$t},water_ph,7.9\n# ghi chú\n,water_temp,29.1\n";

        $this->call('POST', route('api.v1.ingest.compact'), server: $this->transformHeadersToServerVars($this->headers() + ['Content-Type' => 'text/plain']), content: $body)
            ->assertOk()
            ->assertJsonPath('accepted', 3);
    }

    public function test_device_time(): void
    {
        $this->getJson(route('api.v1.device.time'), $this->headers())
            ->assertOk()
            ->assertJsonStructure(['time', 'iso']);
    }

    /**
     * @return array<string, string>
     */
    private function headers(): array
    {
        return ['Authorization' => 'Bearer '.$this->key];
    }
}
