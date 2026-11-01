<?php

namespace Tests\Feature;

use App\Enums\PlotType;
use App\Enums\ReadingSource;
use App\Models\Device;
use App\Models\Farm;
use App\Models\Metric;
use App\Models\Plot;
use App\Models\PushToken;
use App\Models\User;
use App\Services\ReadingIngestor;
use Database\Seeders\MetricSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PushNotificationTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private Device $device;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(MetricSeeder::class);
        Carbon::setTestNow('2026-10-30 02:15:00');
        $this->user = User::factory()->create();
        $farm = Farm::factory()->for($this->user)->create();
        $plot = Plot::factory()->for($farm)->create(['type' => PlotType::Pond, 'name' => 'Ao tôm 1']);
        $plot->thresholds()->create(['metric_id' => Metric::byCode()['water_do']->id, 'min' => 4]);
        $this->device = Device::factory()->for($farm)->create(['plot_id' => $plot->id, 'name' => 'Đo nước ao 1']);
    }

    public function test_register_and_remove_push_token(): void
    {
        Sanctum::actingAs($this->user);

        $this->putJson(route('api.v1.push-token.store'), ['token' => 'ExponentPushToken[abc]', 'platform' => 'android'])->assertNoContent();
        $this->putJson(route('api.v1.push-token.store'), ['token' => 'ExponentPushToken[abc]'])->assertNoContent();
        $this->assertSame(1, PushToken::query()->count());
        $this->putJson(route('api.v1.push-token.store'), ['token' => 'khong-hop-le'])->assertJsonValidationErrors('token');

        // Máy đăng nhập tài khoản khác: token chuyển sang tài khoản mới
        $other = User::factory()->create();
        Sanctum::actingAs($other);
        $this->putJson(route('api.v1.push-token.store'), ['token' => 'ExponentPushToken[abc]'])->assertNoContent();
        $this->assertSame($other->id, PushToken::query()->sole()->user_id);

        $this->deleteJson(route('api.v1.push-token.destroy'), ['token' => 'ExponentPushToken[abc]'])->assertNoContent();
        $this->assertSame(0, PushToken::query()->count());
    }

    public function test_push_sent_once_when_alert_opens(): void
    {
        Http::fake(['exp.host/*' => Http::response(['data' => [['status' => 'ok']]])]);
        $this->user->pushTokens()->create(['token' => 'ExponentPushToken[abc]']);

        $this->ingest(3.9, '02:00');
        $this->ingest(3.7, '02:15');

        Http::assertSentCount(1);
        Http::assertSent(fn (Request $request) => $request['0']['to'] === 'ExponentPushToken[abc]'
            && $request['0']['title'] === 'Ao tôm 1: Oxy hòa tan (DO) thấp'
            && $request['0']['body'] === '3,90 mg/L (ngưỡng ≥ 4,00 mg/L). Đo lúc 02:00 30/10 bởi Đo nước ao 1.'
            && $request['0']['channelId'] === 'iot-alerts');
    }

    public function test_unregistered_token_is_removed(): void
    {
        Http::fake(['exp.host/*' => Http::response(['data' => [['status' => 'error', 'details' => ['error' => 'DeviceNotRegistered']]]])]);
        $this->user->pushTokens()->create(['token' => 'ExponentPushToken[old]']);

        $this->ingest(3.5, '02:00');

        $this->assertSame(0, PushToken::query()->count());
    }

    public function test_no_push_without_tokens(): void
    {
        Http::fake();
        $this->ingest(3.5, '02:00');

        Http::assertNothingSent();
    }

    private function ingest(float $value, string $time): void
    {
        app(ReadingIngestor::class)->ingest($this->device, [
            ['metric' => 'water_do', 'value' => $value, 't' => Carbon::parse('2026-10-30 '.$time)->getTimestamp()],
        ], ReadingSource::Http);
    }
}
