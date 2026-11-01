<?php

namespace Tests\Feature;

use App\Enums\ActuatorKind;
use App\Enums\CommandStatus;
use App\Enums\PlotType;
use App\Enums\ReadingSource;
use App\Models\Actuator;
use App\Models\ActuatorCommand;
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
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ControlTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private Plot $pond;

    /** Mạch điều khiển relay (cắm điện, luôn bật) */
    private Device $controller;

    private string $controllerKey;

    /** Mạch đo nước ao */
    private Device $sensor;

    private Actuator $aerator;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(MetricSeeder::class);
        Carbon::setTestNow('2026-11-01 02:00:00');
        Http::fake(['exp.host/*' => Http::response(['data' => [['status' => 'ok']]])]);

        $this->user = User::factory()->create();
        $this->user->pushTokens()->create(['token' => 'ExponentPushToken[abc]']);
        $farm = Farm::factory()->for($this->user)->create();
        $this->pond = Plot::factory()->for($farm)->create(['type' => PlotType::Pond, 'name' => 'Ao tôm 1']);
        $this->controller = Device::factory()->for($farm)->create(['plot_id' => $this->pond->id, 'name' => 'Tủ điều khiển ao 1']);
        $this->controllerKey = $this->controller->rotateKey();
        $this->sensor = Device::factory()->for($farm)->create(['plot_id' => $this->pond->id]);
        $this->aerator = $this->controller->actuators()->create(['name' => 'Quạt oxy 1', 'kind' => ActuatorKind::Aerator, 'channel' => 1, 'plot_id' => $this->pond->id, 'max_minutes' => 120]);
    }

    public function test_manual_command_lifecycle(): void
    {
        Sanctum::actingAs($this->user);

        $commandId = $this->postJson(route('api.v1.actuators.command', $this->aerator), ['action' => 'on', 'minutes' => 30])
            ->assertCreated()
            ->assertJsonPath('data.status', 'pending')
            ->json('data.id');
        $this->getJson(route('api.v1.actuators.index', $this->pond))->assertJsonPath('data.0.pending.action', 'on')->assertJsonPath('data.0.is_on', false);

        // Mạch hỏi lệnh (kèm trạng thái relay hiện tại)
        $this->getJson(route('api.v1.device.commands', ['states' => '1:0']), $this->device())
            ->assertOk()
            ->assertJsonPath('commands', [['id' => $commandId, 'channel' => 1, 'action' => 'on', 'minutes' => 30]])
            ->assertJsonPath('poll_seconds', 10);
        $this->assertSame(CommandStatus::Sent, ActuatorCommand::find($commandId)->status);

        // Chưa báo kết quả thì gửi lại (mạch bỏ qua id đã làm)
        $this->getJson(route('api.v1.device.commands'), $this->device())->assertJsonCount(1, 'commands');

        $this->postJson(route('api.v1.device.commands.ack', $commandId), ['ok' => true, 'states' => '1:1'], $this->device())
            ->assertOk()
            ->assertJsonPath('status', 'done');
        $aerator = $this->aerator->fresh();
        $this->assertTrue($aerator->is_on);
        $this->assertSame('2026-11-01 02:30:00', $aerator->auto_off_at->format('Y-m-d H:i:s'));
        $this->getJson(route('api.v1.device.commands'), $this->device())->assertJsonCount(0, 'commands');

        // Hết 30 phút mạch tự tắt, báo trạng thái ở lần hỏi sau
        $this->getJson(route('api.v1.device.commands', ['states' => '1:0']), $this->device());
        $this->assertFalse($this->aerator->fresh()->is_on);
        $this->assertNull($this->aerator->fresh()->auto_off_at);
    }

    public function test_on_is_capped_and_new_command_replaces_old(): void
    {
        Sanctum::actingAs($this->user);

        $this->postJson(route('api.v1.actuators.command', $this->aerator), ['action' => 'on', 'minutes' => 500])->assertJsonValidationErrors('minutes');
        $first = $this->postJson(route('api.v1.actuators.command', $this->aerator), ['action' => 'on'])->assertJsonPath('data.minutes', 120)->json('data.id');
        $this->postJson(route('api.v1.actuators.command', $this->aerator), ['action' => 'off'])->assertJsonPath('data.minutes', null);

        $this->assertSame(CommandStatus::Replaced, ActuatorCommand::find($first)->status);
        $this->getJson(route('api.v1.device.commands'), $this->device())->assertJsonCount(1, 'commands')->assertJsonPath('commands.0.action', 'off');
    }

    public function test_command_expires_when_controller_offline(): void
    {
        Sanctum::actingAs($this->user);
        $id = $this->postJson(route('api.v1.actuators.command', $this->aerator), ['action' => 'on', 'minutes' => 30])->json('data.id');

        Carbon::setTestNow('2026-11-01 02:11:00');
        $this->artisan('commands:expire')->assertSuccessful();

        $this->assertSame(CommandStatus::Expired, ActuatorCommand::find($id)->status);
        // Mạch có điện lại: không tự bật muộn
        $this->getJson(route('api.v1.device.commands'), $this->device())->assertJsonCount(0, 'commands');
        Http::assertSent(fn (Request $request) => $request['0']['title'] === 'Chưa bật được Quạt oxy 1');
    }

    public function test_failed_ack_notifies_owner(): void
    {
        Sanctum::actingAs($this->user);
        $id = $this->postJson(route('api.v1.actuators.command', $this->aerator), ['action' => 'on', 'minutes' => 10])->json('data.id');

        $this->postJson(route('api.v1.device.commands.ack', $id), ['ok' => false, 'message' => 'Relay kênh 1 không phản hồi'], $this->device())->assertJsonPath('status', 'failed');

        $this->assertFalse($this->aerator->fresh()->is_on);
        Http::assertSent(fn (Request $request) => $request['0']['title'] === 'Lỗi điều khiển Quạt oxy 1' && str_contains($request['0']['body'], 'Relay kênh 1'));
    }

    public function test_ingest_response_carries_commands_for_controllers(): void
    {
        Sanctum::actingAs($this->user);
        $this->postJson(route('api.v1.actuators.command', $this->aerator), ['action' => 'on', 'minutes' => 15]);

        $this->postJson(route('api.v1.ingest.store'), ['readings' => [['metric' => 'water_temp', 'value' => 28]]], $this->device())
            ->assertOk()
            ->assertJsonPath('accepted', 1)
            ->assertJsonPath('commands.0.action', 'on');
    }

    public function test_rule_turns_aerator_on_when_do_low_and_off_when_recovered(): void
    {
        Sanctum::actingAs($this->user);
        $this->postJson(route('api.v1.rules.store', $this->pond), [
            'metric' => 'water_do', 'actuator_id' => $this->aerator->id, 'operator' => 'below', 'value' => 4, 'off_value' => 5, 'minutes' => 90,
        ])->assertCreated()->assertJsonPath('data.cooldown_minutes', 30);

        $this->measure(4.6);
        $this->assertSame(0, ActuatorCommand::query()->count());

        $this->measure(3.6);
        $on = ActuatorCommand::query()->sole();
        $this->assertSame(['on', 90, 'rule'], [$on->action, $on->minutes, $on->source]);
        $this->assertSame('Oxy hòa tan (DO) 3,6 mg/L < 4', $on->reason);
        Http::assertSent(fn (Request $request) => $request['0']['title'] === '⚙️ Tự bật Quạt oxy 1 (Ao tôm 1)'
            && $request['0']['body'] === 'Vì Oxy hòa tan (DO) 3,6 mg/L < 4. Chạy 90 phút hoặc tới khi số đo trở lại bình thường.');

        // Vẫn thấp: không gửi thêm lệnh (đang chờ bật)
        $this->measure(3.5);
        $this->assertSame(1, ActuatorCommand::query()->count());

        // Mạch bật xong, DO lên 4,5: chưa tới mức tắt
        $this->getJson(route('api.v1.device.commands'), $this->device());
        $this->postJson(route('api.v1.device.commands.ack', $on->id), ['ok' => true], $this->device());
        $this->measure(4.5);
        $this->assertSame(1, ActuatorCommand::query()->count());

        // DO ≥ 5: tắt
        $this->measure(5.2);
        $off = ActuatorCommand::query()->latest('id')->first();
        $this->assertSame(['off', 'rule'], [$off->action, $off->source]);
        $this->assertSame('Oxy hòa tan (DO) 5,2 mg/L, đã về mức ≥ 5', $off->reason);
    }

    public function test_rule_respects_cooldown_and_never_turns_off_manual_run(): void
    {
        Sanctum::actingAs($this->user);
        $this->postJson(route('api.v1.rules.store', $this->pond), [
            'metric' => 'water_do', 'actuator_id' => $this->aerator->id, 'operator' => 'below', 'value' => 4, 'off_value' => 5, 'minutes' => 20, 'cooldown_minutes' => 60,
        ]);

        $this->measure(3.8);
        $this->getJson(route('api.v1.device.commands'), $this->device());
        $this->postJson(route('api.v1.device.commands.ack', ActuatorCommand::query()->value('id')), ['ok' => true], $this->device());

        // 20 phút sau mạch tự tắt, DO vẫn thấp nhưng chưa qua 60 phút nghỉ
        Carbon::setTestNow('2026-11-01 02:25:00');
        $this->getJson(route('api.v1.device.commands', ['states' => '1:0']), $this->device());
        $this->measure(3.7);
        $this->assertSame(1, ActuatorCommand::query()->count());

        // Qua 60 phút: bật lại
        Carbon::setTestNow('2026-11-01 03:05:00');
        $this->measure(3.7);
        $this->assertSame(2, ActuatorCommand::query()->where('action', 'on')->count());

        // Người dùng bật tay rồi DO lên cao: luật không tắt máy người dùng bật
        $this->postJson(route('api.v1.actuators.command', $this->aerator), ['action' => 'on', 'minutes' => 60]);
        $this->measure(6.0);
        $this->assertSame(0, ActuatorCommand::query()->where('action', 'off')->count());
    }

    public function test_rule_validation_and_ownership(): void
    {
        Sanctum::actingAs($this->user);
        $this->postJson(route('api.v1.rules.store', $this->pond), [
            'metric' => 'water_do', 'actuator_id' => $this->aerator->id, 'operator' => 'below', 'value' => 4, 'off_value' => 3, 'minutes' => 20,
        ])->assertUnprocessable()->assertJsonPath('message', 'Mức tắt phải lớn hơn hoặc bằng mức bật.');
        $this->postJson(route('api.v1.actuators.store', $this->controller), ['name' => 'Bơm', 'kind' => 'pump', 'channel' => 1])->assertJsonValidationErrors('channel');
        $this->postJson(route('api.v1.actuators.store', $this->controller), ['name' => 'Bơm cấp nước', 'kind' => 'pump', 'channel' => 2])
            ->assertCreated()
            ->assertJsonPath('data.plot_id', $this->pond->id)
            ->assertJsonPath('data.kind_label', 'Máy bơm');

        // Người khác không điều khiển được; mạch khác không báo kết quả hộ được
        Sanctum::actingAs(User::factory()->create());
        $this->postJson(route('api.v1.actuators.command', $this->aerator), ['action' => 'on'])->assertNotFound();
        $this->getJson(route('api.v1.actuators.index', $this->pond))->assertNotFound();

        Sanctum::actingAs($this->user);
        $id = $this->postJson(route('api.v1.actuators.command', $this->aerator), ['action' => 'on'])->json('data.id');
        $otherKey = $this->sensor->rotateKey();
        $this->postJson(route('api.v1.device.commands.ack', $id), ['ok' => true], ['Authorization' => 'Bearer '.$otherKey])->assertNotFound();
    }

    private function measure(float $do): void
    {
        app(ReadingIngestor::class)->ingest($this->sensor, [['metric' => 'water_do', 'value' => $do]], ReadingSource::Http);
        Carbon::setTestNow(now()->addSecond());
    }

    /**
     * @return array<string, string>
     */
    private function device(): array
    {
        return ['Authorization' => 'Bearer '.$this->controllerKey];
    }
}
