<?php

namespace Tests\Feature;

use App\Enums\ActuatorKind;
use App\Enums\ReadingSource;
use App\Models\Actuator;
use App\Models\Device;
use App\Models\Farm;
use App\Models\FarmMember;
use App\Models\Plot;
use App\Models\User;
use App\Services\ReadingIngestor;
use Database\Seeders\MetricSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;
use ZipArchive;

class FarmSharingTest extends TestCase
{
    use RefreshDatabase;

    private User $owner;

    private Farm $farm;

    private Plot $plot;

    private Device $device;

    private Actuator $pump;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(MetricSeeder::class);
        Http::fake(['exp.host/*' => Http::response(['data' => [['status' => 'ok'], ['status' => 'ok']]])]);

        $this->owner = User::factory()->create(['name' => 'Ông Ba']);
        $this->farm = Farm::factory()->for($this->owner)->create(['name' => 'Vườn sầu riêng']);
        $this->plot = Plot::factory()->for($this->farm)->create(['name' => 'Vườn A']);
        $this->device = Device::factory()->for($this->farm)->create(['plot_id' => $this->plot->id, 'name' => 'Tủ bơm']);
        $this->pump = $this->device->actuators()->create(['name' => 'Bơm tưới', 'kind' => ActuatorKind::Pump, 'channel' => 1, 'plot_id' => $this->plot->id, 'max_minutes' => 60]);
    }

    private function share(string $role): User
    {
        $member = User::factory()->create(['email' => "{$role}@example.com"]);
        Sanctum::actingAs($this->owner);
        $this->postJson(route('api.v1.farm-members.store', $this->farm), ['email' => strtoupper($member->email), 'role' => $role])
            ->assertCreated()
            ->assertJsonPath('data.role', $role);

        return $member;
    }

    public function test_operator_sees_shared_farm_and_can_switch_pump_but_not_edit(): void
    {
        $operator = $this->share(FarmMember::OPERATOR);
        Sanctum::actingAs($operator);

        $this->getJson(route('api.v1.farms.index'))
            ->assertJsonPath('data.0.name', 'Vườn sầu riêng')
            ->assertJsonPath('data.0.role', 'operator')
            ->assertJsonPath('data.0.owner_name', 'Ông Ba');
        $this->getJson(route('api.v1.plots.summary', $this->plot))->assertOk()->assertJsonPath('data.role', 'operator');
        $this->getJson(route('api.v1.devices.index'))->assertJsonCount(1, 'data');

        $this->postJson(route('api.v1.actuators.command', $this->pump), ['action' => 'on', 'minutes' => 10])->assertCreated();

        $this->putJson(route('api.v1.farms.update', $this->farm), ['name' => 'Đổi tên'])->assertForbidden();
        $this->postJson(route('api.v1.plots.store', $this->farm), ['name' => 'Lô mới', 'type' => 'garden'])->assertForbidden();
        $this->deleteJson(route('api.v1.devices.destroy', $this->device))->assertForbidden();
        $this->postJson(route('api.v1.farm-members.store', $this->farm), ['email' => $operator->email, 'role' => 'viewer'])->assertForbidden();
    }

    public function test_viewer_can_only_look(): void
    {
        $viewer = $this->share(FarmMember::VIEWER);
        Sanctum::actingAs($viewer);

        $this->getJson(route('api.v1.plots.summary', $this->plot))->assertOk()->assertJsonPath('data.role', 'viewer');
        $this->getJson(route('api.v1.actuators.index', $this->plot))->assertOk();
        $this->getJson(route('api.v1.farm-members.index', $this->farm))->assertJsonCount(2, 'data')->assertJsonPath('data.0.role', 'owner');

        $this->postJson(route('api.v1.actuators.command', $this->pump), ['action' => 'on', 'minutes' => 10])
            ->assertForbidden()
            ->assertJsonPath('message', 'Bạn chỉ được xem trang trại này, không được bật / tắt máy.');
    }

    /**
     * Chủ tạo sẵn 1 ngưỡng, 1 luật, 1 lịch tưới; trả về id của chúng.
     *
     * @return array{threshold: int, rule: int, schedule: int}
     */
    private function ownerCreatesSettings(): array
    {
        Sanctum::actingAs($this->owner);

        return [
            'threshold' => $this->postJson(route('api.v1.thresholds.store', $this->plot), ['metric' => 'soil_ph', 'min' => 5.5, 'max' => 6.5])->assertCreated()->json('data.id'),
            'rule' => $this->postJson(route('api.v1.rules.store', $this->plot), ['metric' => 'soil_moisture', 'actuator_id' => $this->pump->id, 'operator' => 'below', 'value' => 30, 'minutes' => 10])->assertCreated()->json('data.id'),
            'schedule' => $this->postJson(route('api.v1.schedules.store', $this->pump), ['start_time' => '05:30', 'minutes' => 15, 'every_days' => 1])->assertCreated()->json('data.id'),
        ];
    }

    public function test_members_see_schedules_rules_and_thresholds_but_cannot_change_them(): void
    {
        foreach ([FarmMember::VIEWER, FarmMember::OPERATOR] as $role) {
            $member = $this->share($role);
            $ids = $this->ownerCreatesSettings();
            Sanctum::actingAs($member);

            $this->getJson(route('api.v1.thresholds.index', $this->plot))->assertOk()->assertJsonPath('data.0.id', $ids['threshold']);
            $this->getJson(route('api.v1.rules.index', $this->plot))->assertOk()->assertJsonPath('data.0.id', $ids['rule']);
            $this->getJson(route('api.v1.schedules.index', $this->plot))->assertOk()->assertJsonPath('data.0.id', $ids['schedule']);

            $this->postJson(route('api.v1.thresholds.store', $this->plot), ['metric' => 'soil_ph', 'min' => 4])->assertForbidden();
            $this->deleteJson(route('api.v1.thresholds.destroy', $ids['threshold']))->assertForbidden();
            $this->postJson(route('api.v1.rules.store', $this->plot), ['metric' => 'soil_moisture', 'actuator_id' => $this->pump->id, 'operator' => 'below', 'value' => 20, 'minutes' => 5])->assertForbidden();
            $this->putJson(route('api.v1.rules.update', $ids['rule']), ['metric' => 'soil_moisture', 'actuator_id' => $this->pump->id, 'operator' => 'below', 'value' => 20, 'minutes' => 5])->assertForbidden();
            $this->deleteJson(route('api.v1.rules.destroy', $ids['rule']))->assertForbidden();
            $this->postJson(route('api.v1.schedules.store', $this->pump), ['start_time' => '06:00', 'minutes' => 5, 'every_days' => 1])->assertForbidden();
            $this->putJson(route('api.v1.schedules.update', $ids['schedule']), ['start_time' => '06:00', 'minutes' => 5, 'every_days' => 1])->assertForbidden();
            $this->deleteJson(route('api.v1.schedules.destroy', $ids['schedule']))->assertForbidden();

            // Không xóa được gì: vẫn còn đủ
            $this->getJson(route('api.v1.thresholds.index', $this->plot))->assertJsonCount(1, 'data');
            $this->getJson(route('api.v1.rules.index', $this->plot))->assertJsonCount(1, 'data');
            $this->getJson(route('api.v1.schedules.index', $this->plot))->assertJsonCount(1, 'data');

            // Dọn để vòng sau (vai trò khác) bắt đầu từ đầu
            $this->plot->thresholds()->delete();
            $this->plot->rules()->delete();
            $this->pump->schedules()->delete();
            FarmMember::query()->delete();
        }
    }

    public function test_strangers_cannot_see_schedules_rules_or_thresholds(): void
    {
        $ids = $this->ownerCreatesSettings();
        Sanctum::actingAs(User::factory()->create());

        $this->getJson(route('api.v1.thresholds.index', $this->plot))->assertNotFound();
        $this->getJson(route('api.v1.rules.index', $this->plot))->assertNotFound();
        $this->getJson(route('api.v1.schedules.index', $this->plot))->assertNotFound();
        $this->postJson(route('api.v1.thresholds.store', $this->plot), ['metric' => 'soil_ph', 'min' => 4])->assertNotFound();
        $this->deleteJson(route('api.v1.thresholds.destroy', $ids['threshold']))->assertNotFound();
        $this->deleteJson(route('api.v1.rules.destroy', $ids['rule']))->assertNotFound();
        $this->deleteJson(route('api.v1.schedules.destroy', $ids['schedule']))->assertNotFound();
    }

    public function test_strangers_get_not_found(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson(route('api.v1.plots.summary', $this->plot))->assertNotFound();
        $this->getJson(route('api.v1.farm-members.index', $this->farm))->assertNotFound();
        $this->getJson(route('api.v1.farms.index'))->assertJsonCount(0, 'data');
    }

    public function test_invite_needs_existing_account_and_member_can_leave(): void
    {
        Sanctum::actingAs($this->owner);
        $this->postJson(route('api.v1.farm-members.store', $this->farm), ['email' => 'chua-co@example.com', 'role' => 'viewer'])->assertUnprocessable();
        $this->postJson(route('api.v1.farm-members.store', $this->farm), ['email' => $this->owner->email, 'role' => 'viewer'])->assertUnprocessable();

        $member = $this->share(FarmMember::VIEWER);
        $shareId = FarmMember::query()->value('id');
        $this->putJson(route('api.v1.farm-members.update', $shareId), ['role' => 'operator'])->assertJsonPath('data.role', 'operator');

        Sanctum::actingAs($member);
        $this->deleteJson(route('api.v1.farm-members.destroy', $shareId))->assertNoContent();
        $this->getJson(route('api.v1.plots.summary', $this->plot))->assertNotFound();
    }

    public function test_members_get_alert_notifications_too(): void
    {
        $this->owner->pushTokens()->create(['token' => 'ExponentPushToken[owner]']);
        $member = $this->share(FarmMember::VIEWER);
        $member->pushTokens()->create(['token' => 'ExponentPushToken[member]']);
        $this->postJson(route('api.v1.thresholds.store', $this->plot), ['metric' => 'soil_ph', 'min' => 5.5, 'max' => 6.5])->assertSuccessful();

        app(ReadingIngestor::class)->ingest($this->device, [['metric' => 'soil_ph', 'value' => 8.1]], ReadingSource::Http);

        Http::assertSent(fn (Request $request) => str_contains($request->url(), 'exp.host')
            && collect($request->data())->pluck('to')->sort()->values()->all() === ['ExponentPushToken[member]', 'ExponentPushToken[owner]']);
    }

    public function test_export_plot_readings_to_excel_and_csv(): void
    {
        $viewer = $this->share(FarmMember::VIEWER);
        app(ReadingIngestor::class)->ingest($this->device, [
            ['metric' => 'soil_ph', 'value' => 6.25, 't' => now()->subHours(3)->timestamp],
            ['metric' => 'soil_moisture', 'value' => 41.5, 't' => now()->subHours(3)->timestamp],
            ['metric' => 'soil_ph', 'value' => 9.9, 't' => now()->subDays(40)->timestamp],
        ], ReadingSource::Http);
        Sanctum::actingAs($viewer);

        $response = $this->get(route('api.v1.plots.export', ['plot' => $this->plot, 'days' => 30]))->assertOk();
        $this->assertStringContainsString('so-do-vuon-a-', $response->headers->get('content-disposition'));
        $zip = new ZipArchive;
        $this->assertTrue($zip->open($response->baseResponse->getFile()->getPathname()));
        $sheet = $zip->getFromName('xl/worksheets/sheet1.xml');
        $zip->close();
        $this->assertStringContainsString('<t>Thời gian</t>', $sheet);
        $this->assertStringContainsString('<v>6.25</v>', $sheet);
        $this->assertStringContainsString('<v>41.5</v>', $sheet);
        $this->assertStringNotContainsString('9.9', $sheet);

        $csv = $this->get(route('api.v1.plots.export', ['plot' => $this->plot, 'days' => 60, 'format' => 'csv']))->assertOk()->streamedContent();
        $this->assertStringStartsWith("\xEF\xBB\xBF\"Thời gian\",\"Thiết bị\"", $csv);
        $this->assertSame(4, substr_count(trim($csv), "\n") + 1);
        $this->assertStringContainsString('"Tủ bơm","pH đất",6.25,', $csv);
    }
}
