<?php

namespace Tests\Feature;

use App\Enums\ActuatorKind;
use App\Enums\CommandStatus;
use App\Models\Actuator;
use App\Models\ActuatorCommand;
use App\Models\Device;
use App\Models\Farm;
use App\Models\Plot;
use App\Models\User;
use Database\Seeders\FieldMapSeeder;
use Database\Seeders\MetricSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Bật / tắt máy bơm qua mạch relay LoRaWAN (Dragino LT-22222-L): lệnh 03 aa bb đẩy xuống qua network server,
 * mạch gửi lên RO1_status / RO2_status để xác nhận; hết giờ thì máy chủ gửi lệnh tắt.
 */
class LoRaWanControlTest extends TestCase
{
    use RefreshDatabase;

    private const PUSH_URL = 'https://eu1.cloud.thethings.network/api/v3/as/applications/nhanong/webhooks/iot/devices/lt-vuon-a/down/push';

    private User $user;

    private Device $relay;

    private Actuator $pump;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed([MetricSeeder::class, FieldMapSeeder::class]);
        config(['iot.lorawan_secret' => 'lora-secret', 'iot.lorawan.downlink_fport' => 2]);
        Carbon::setTestNow('2026-11-01 06:00:00');
        Http::fake(['*' => Http::response(['data' => [['status' => 'ok']]])]);

        $this->user = User::factory()->create();
        $farm = Farm::factory()->for($this->user)->create();
        $plot = Plot::factory()->for($farm)->create();
        $this->relay = Device::factory()->lorawan('A84041000181C999', 'dragino-lt22222')->create(['farm_id' => $farm->id, 'plot_id' => $plot->id]);
        $this->pump = $this->relay->actuators()->create(['name' => 'Bơm tưới', 'kind' => ActuatorKind::Pump, 'channel' => 1, 'plot_id' => $plot->id, 'max_minutes' => 60]);
    }

    /**
     * @param  array<string, string>  $relays
     * @param  array<string, string>  $headers
     */
    private function uplink(array $relays, array $headers = []): void
    {
        $body = [
            'end_device_ids' => ['device_id' => 'lt-vuon-a', 'dev_eui' => 'A84041000181C999'],
            'received_at' => now()->toIso8601String(),
            'uplink_message' => ['decoded_payload' => $relays + ['Work_mode' => '2ACI+2AVI', 'AVI1_V' => 0.0]],
        ];
        $this->postJson(route('api.v1.lorawan.ttn'), $body, ['X-Webhook-Secret' => 'lora-secret'] + $headers)->assertOk();
    }

    public function test_ttn_downlink_on_confirm_and_auto_off(): void
    {
        // Bản tin gửi lên kèm địa chỉ + khóa đẩy lệnh xuống
        $this->uplink(['RO1_status' => 'OFF', 'RO2_status' => 'OFF'], ['X-Downlink-Push' => self::PUSH_URL, 'X-Downlink-Apikey' => 'NNSXS.KHOA']);
        $this->assertSame(self::PUSH_URL, $this->relay->fresh()->downlink['push_url']);

        Sanctum::actingAs($this->user);
        $this->postJson(route('api.v1.actuators.command', $this->pump), ['action' => 'on', 'minutes' => 20])->assertCreated();

        // 03 01 11: RO1 đóng (bơm chạy), RO2 giữ nguyên
        Http::assertSent(fn (Request $request) => $request->url() === self::PUSH_URL
            && $request->hasHeader('Authorization', 'Bearer NNSXS.KHOA')
            && $request['downlinks'][0]['frm_payload'] === base64_encode("\x03\x01\x11")
            && $request['downlinks'][0]['f_port'] === 2);
        $command = ActuatorCommand::query()->sole();
        $this->assertSame(CommandStatus::Sent, $command->status);

        // Mạch báo RO1 đang bật: lệnh đã làm, máy đang chạy tới 06:20
        $this->uplink(['RO1_status' => 'ON', 'RO2_status' => 'OFF']);
        $this->assertSame(CommandStatus::Done, $command->fresh()->status);
        $pump = $this->pump->fresh();
        $this->assertTrue($pump->is_on);
        $this->assertSame('06:20', $pump->auto_off_at->format('H:i'));

        // Hết giờ: máy chủ gửi lệnh tắt 03 00 11
        Carbon::setTestNow('2026-11-01 06:21:00');
        $this->artisan('commands:expire')->assertSuccessful();
        $off = ActuatorCommand::query()->latest('id')->first();
        $this->assertSame([ActuatorCommand::OFF, ActuatorCommand::SOURCE_TIMER], [$off->action, $off->source]);
        Http::assertSent(fn (Request $request) => $request->url() === self::PUSH_URL && $request['downlinks'][0]['frm_payload'] === base64_encode("\x03\x00\x11"));

        $this->uplink(['RO1_status' => 'OFF', 'RO2_status' => 'OFF']);
        $this->assertFalse($this->pump->fresh()->is_on);
        // Không gửi tắt lần nữa
        $this->artisan('commands:expire')->assertSuccessful();
        $this->assertSame(2, ActuatorCommand::query()->count());
    }

    public function test_chirpstack_queue_is_used_when_configured(): void
    {
        config(['iot.lorawan.chirpstack_url' => 'http://chirpstack:8090/', 'iot.lorawan.chirpstack_token' => 'cs-token']);
        $this->pump->update(['channel' => 2]);
        Sanctum::actingAs($this->user);

        $this->postJson(route('api.v1.actuators.command', $this->pump), ['action' => 'on', 'minutes' => 10])->assertCreated();

        Http::assertSent(fn (Request $request) => $request->url() === 'http://chirpstack:8090/api/devices/a84041000181c999/queue'
            && $request->hasHeader('Grpc-Metadata-Authorization', 'Bearer cs-token')
            && $request['queueItem']['data'] === base64_encode("\x03\x11\x01"));
    }

    public function test_without_downlink_route_command_fails_with_reason(): void
    {
        Sanctum::actingAs($this->user);

        $this->postJson(route('api.v1.actuators.command', $this->pump), ['action' => 'on', 'minutes' => 10])->assertCreated();

        $command = ActuatorCommand::query()->sole();
        $this->assertSame(CommandStatus::Failed, $command->status);
        $this->assertStringContainsString('Downlink API key', $command->message);
    }

    public function test_only_relay_profiles_get_actuators(): void
    {
        $sensor = Device::factory()->lorawan('A84041000181C27A', 'dragino-se01')->create(['farm_id' => $this->relay->farm_id]);
        Sanctum::actingAs($this->user);

        $this->postJson(route('api.v1.actuators.store', $sensor), ['name' => 'Bơm', 'kind' => 'pump', 'channel' => 1])->assertUnprocessable();
        $this->postJson(route('api.v1.actuators.store', $this->relay), ['name' => 'Quạt', 'kind' => 'aerator', 'channel' => 3])
            ->assertUnprocessable()
            ->assertJsonPath('message', 'Mạch này chỉ có 2 relay.');
        $this->getJson(route('api.v1.devices.profiles'))->assertJsonFragment(['code' => 'dragino-lt22222']);
    }
}
