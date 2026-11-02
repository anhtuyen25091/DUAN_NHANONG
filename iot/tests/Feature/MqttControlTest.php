<?php

namespace Tests\Feature;

use App\Enums\ActuatorKind;
use App\Enums\CommandStatus;
use App\Models\Actuator;
use App\Models\ActuatorCommand;
use App\Models\Device;
use App\Models\Farm;
use App\Models\User;
use App\Services\Mqtt\MqttInbox;
use App\Services\Mqtt\MqttPublisher;
use Database\Seeders\MetricSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use RuntimeException;
use Tests\TestCase;

/**
 * Đẩy lệnh bật / tắt xuống mạch ESP32 qua MQTT (nhanong/{uid}/down), mạch báo kết quả lên nhanong/{uid}/ack.
 * HTTP (GET /device/commands) vẫn là đường dự phòng. Broker giả: ghi lại bản tin, không cần Mosquitto.
 */
class MqttControlTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private Device $controller;

    private string $key;

    private Actuator $pump;

    /** @var list<array{topic: string, message: string, qos: int, retain: bool}> */
    private array $published = [];

    private bool $brokerDown = false;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(MetricSeeder::class);
        Carbon::setTestNow('2026-11-02 06:00:00');
        Http::fake(['exp.host/*' => Http::response(['data' => [['status' => 'ok']]])]);

        $test = $this;
        $this->app->instance(MqttPublisher::class, new class($test) extends MqttPublisher
        {
            public function __construct(private readonly MqttControlTest $test) {}

            public function publish(string $topic, string $message, int $qos = 1, bool $retain = false): void
            {
                $this->test->record($topic, $message, $qos, $retain);
            }
        });

        $this->user = User::factory()->create();
        $this->user->pushTokens()->create(['token' => 'ExponentPushToken[abc]']);
        $farm = Farm::factory()->for($this->user)->create();
        $this->controller = Device::factory()->for($farm)->create(['name' => 'Tủ bơm vườn']);
        $this->key = $this->controller->rotateKey();
        $this->pump = $this->controller->actuators()->create(['name' => 'Bơm tưới', 'kind' => ActuatorKind::Pump, 'channel' => 2, 'max_minutes' => 60]);
    }

    public function record(string $topic, string $message, int $qos, bool $retain): void
    {
        if ($this->brokerDown) {
            throw new RuntimeException('Không gửi được qua MQTT: Connection refused');
        }
        $this->published[] = compact('topic', 'message', 'qos', 'retain');
    }

    private function mqtt(string $kind, array $payload): ?string
    {
        return app(MqttInbox::class)->handle("nhanong/{$this->controller->uid}/{$kind}", json_encode($payload));
    }

    /** Mạch vừa nối MQTT: báo trạng thái relay lên topic ack */
    private function connectMqtt(): void
    {
        $this->mqtt('ack', ['key' => $this->key, 'states' => '1:0,2:0']);
    }

    private function turnOn(int $minutes = 20): int
    {
        Sanctum::actingAs($this->user);

        return $this->postJson(route('api.v1.actuators.command', $this->pump), ['action' => 'on', 'minutes' => $minutes])->assertCreated()->json('data.id');
    }

    /**
     * @return array<string, mixed> phần data đã kiểm chữ ký
     */
    private function downlink(int $index = 0): array
    {
        $message = json_decode($this->published[$index]['message'], true);
        // Mạch kiểm chữ ký bằng khóa của mình
        $this->assertSame(hash_hmac('sha256', $message['data'], $this->key), $message['sig']);

        return json_decode($message['data'], true);
    }

    public function test_command_is_pushed_over_mqtt_and_ack_marks_done(): void
    {
        $this->controller->update(['measure_interval_min' => 30]);
        $this->connectMqtt();
        $this->assertNotNull($this->controller->fresh()->mqtt_seen_at);

        $id = $this->turnOn(20);

        $this->assertCount(1, $this->published);
        $this->assertSame("nhanong/{$this->controller->uid}/down", $this->published[0]['topic']);
        $this->assertSame(1, $this->published[0]['qos']);
        $this->assertFalse($this->published[0]['retain']);
        $data = $this->downlink();
        $this->assertSame([['id' => $id, 'channel' => 2, 'action' => 'on', 'minutes' => 20]], $data['commands']);
        $this->assertSame(Carbon::parse('2026-11-02 06:10:00')->getTimestamp(), $data['exp']);
        $this->assertSame(['measure_interval_min' => 30], $data['config']);

        // Broker nhận chưa chắc mạch đã nhận: vẫn "chờ gửi" (mất mạng thì quá hạn + báo như HTTP), có ghi lúc đẩy
        $command = ActuatorCommand::find($id);
        $this->assertSame(CommandStatus::Pending, $command->status);
        $this->assertNotNull($command->sent_at);

        // Mạch làm xong báo lên topic ack
        $this->assertSame("{$this->controller->uid}: lệnh #{$id} đã làm", $this->mqtt('ack', ['key' => $this->key, 'id' => $id, 'ok' => true, 'states' => '1:0,2:1']));
        $this->assertSame(CommandStatus::Done, $command->fresh()->status);
        $pump = $this->pump->fresh();
        $this->assertTrue($pump->is_on);
        $this->assertSame('06:20', $pump->auto_off_at->format('H:i'));

        // Lệnh đã làm thì HTTP không trả nữa
        $this->getJson(route('api.v1.device.commands'), ['Authorization' => "Bearer {$this->key}"])->assertJsonCount(0, 'commands');
    }

    public function test_http_only_controller_is_not_pushed(): void
    {
        $this->turnOn();

        $this->assertSame([], $this->published);
        $this->getJson(route('api.v1.device.commands'), ['Authorization' => "Bearer {$this->key}"])->assertJsonCount(1, 'commands');
    }

    public function test_controller_silent_on_mqtt_for_a_day_falls_back_to_http_only(): void
    {
        $this->connectMqtt();
        Carbon::setTestNow('2026-11-03 06:30:00');

        $this->turnOn();

        $this->assertSame([], $this->published);
    }

    public function test_broker_down_leaves_command_for_http_poll_without_retry(): void
    {
        $this->connectMqtt();
        $this->brokerDown = true;

        $id = $this->turnOn();

        $command = ActuatorCommand::find($id);
        $this->assertSame(CommandStatus::Pending, $command->status);
        $this->assertNull($command->sent_at);

        // Mạch vẫn lấy được qua HTTP và báo kết quả qua HTTP
        $headers = ['Authorization' => "Bearer {$this->key}"];
        $this->getJson(route('api.v1.device.commands'), $headers)->assertJsonPath('commands.0.id', $id);
        $this->postJson(route('api.v1.device.commands.ack', $id), ['ok' => true, 'states' => '2:1'], $headers)->assertJsonPath('status', 'done');
        $this->assertTrue($this->pump->fresh()->is_on);
    }

    public function test_lost_mqtt_ack_is_recovered_by_http_poll_and_duplicate_ack_is_ignored(): void
    {
        $this->connectMqtt();
        $id = $this->turnOn();
        $headers = ['Authorization' => "Bearer {$this->key}"];

        // Mạch đã làm theo MQTT nhưng báo cáo bị mất: lần hỏi HTTP sau lệnh vẫn còn (cùng id, mạch nhận ra đã làm, chỉ báo lại)
        $this->getJson(route('api.v1.device.commands'), $headers)->assertJsonPath('commands.0.id', $id);
        $this->assertSame(CommandStatus::Sent, ActuatorCommand::find($id)->status);
        $this->postJson(route('api.v1.device.commands.ack', $id), ['ok' => true, 'states' => '2:1'], $headers)->assertJsonPath('status', 'done');

        // Báo cáo MQTT tới muộn: bỏ qua, không đổi gì
        $doneAt = ActuatorCommand::find($id)->done_at;
        $this->mqtt('ack', ['key' => $this->key, 'id' => $id, 'ok' => false, 'message' => 'trễ']);
        $command = ActuatorCommand::find($id);
        $this->assertSame(CommandStatus::Done, $command->status);
        $this->assertEquals($doneAt, $command->done_at);
        Http::assertNothingSent();
    }

    public function test_failed_mqtt_ack_notifies_phone(): void
    {
        $this->connectMqtt();
        $id = $this->turnOn();

        $this->mqtt('ack', ['key' => $this->key, 'id' => $id, 'ok' => false, 'message' => 'Mạch không có kênh relay này']);

        $this->assertSame(CommandStatus::Failed, ActuatorCommand::find($id)->status);
        Http::assertSent(fn (Request $request) => $request['0']['title'] === 'Lỗi điều khiển Bơm tưới' && str_contains($request['0']['body'], 'kênh relay'));
    }

    public function test_pushed_but_never_acked_expires_and_notifies(): void
    {
        $this->connectMqtt();
        $id = $this->turnOn();

        Carbon::setTestNow('2026-11-02 06:11:00');
        $this->artisan('commands:expire')->assertSuccessful();

        $this->assertSame(CommandStatus::Expired, ActuatorCommand::find($id)->status);
        Http::assertSent(fn (Request $request) => $request['0']['title'] === 'Chưa bật được Bơm tưới');
    }

    public function test_ack_with_wrong_key_or_other_device_command_is_ignored(): void
    {
        $this->connectMqtt();
        $id = $this->turnOn();

        $this->assertNull($this->mqtt('ack', ['key' => 'ndk_sai', 'id' => $id, 'ok' => true]));

        // Mạch khác (đúng khóa của nó) báo kết quả lệnh của mạch này
        $other = Device::factory()->for($this->controller->farm)->create();
        $otherKey = $other->rotateKey();
        app(MqttInbox::class)->handle("nhanong/{$other->uid}/ack", json_encode(['key' => $otherKey, 'id' => $id, 'ok' => true]));

        $this->assertSame(CommandStatus::Pending, ActuatorCommand::find($id)->status);
    }

    public function test_remote_config_change_is_pushed_to_mqtt_controller(): void
    {
        $this->connectMqtt();

        $this->controller->fresh()->update(['measure_interval_min' => 60]);

        $this->assertCount(1, $this->published);
        $data = $this->downlink();
        $this->assertSame([], $data['commands']);
        $this->assertSame(['measure_interval_min' => 60], $data['config']);
    }

    public function test_readings_over_mqtt_mark_device_as_mqtt(): void
    {
        $this->assertSame(
            "{$this->controller->uid}: nhận 1, trùng 0, loại 0",
            $this->mqtt('up', ['key' => $this->key, 'readings' => [['metric' => 'soil_ph', 'value' => 6.2]]]),
        );
        $this->assertTrue($this->controller->fresh()->usesMqttDownlink());
    }
}
