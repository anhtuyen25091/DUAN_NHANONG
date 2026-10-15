<?php

namespace Tests\Feature;

use App\Alerts\PriceAlertEvaluator;
use App\Enums\AlertCondition;
use App\Models\Device;
use App\Models\Price;
use App\Models\PriceAlert;
use App\Models\Product;
use App\Models\Region;
use Carbon\CarbonImmutable;
use Database\Seeders\CatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class PriceAlertEvaluatorTest extends TestCase
{
    use RefreshDatabase;

    private Product $pepper;

    private Region $dakLak;

    private Device $device;

    /** @var array<string, mixed> */
    private array $ticket = ['status' => 'ok', 'id' => 'x'];

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(CatalogSeeder::class);
        $this->pepper = Product::query()->where('code', 'ho-tieu')->firstOrFail();
        $this->dakLak = Region::query()->where('code', 'dak-lak')->firstOrFail();
        $this->device = Device::factory()->create(['push_token' => 'ExponentPushToken[abc]']);

        Http::preventStrayRequests();
        Http::fake(['exp.host/*' => fn (Request $request) => Http::response([
            'data' => array_map(fn (): array => $this->ticket, $request->data()),
        ])]);
    }

    public function test_change_alert_notifies_once_per_new_price(): void
    {
        $this->alert(AlertCondition::Change);
        $this->price('2026-10-13', 138000);
        $this->price('2026-10-14', 139500);

        $this->assertSame(1, $this->evaluate('2026-10-14'));
        Http::assertSent(fn (Request $request): bool => $request[0]['to'] === 'ExponentPushToken[abc]'
            && $request[0]['title'] === 'Giá '.$this->pepper->name
            && str_contains($request[0]['body'], '139.500đ')
            && str_contains($request[0]['body'], '(tăng 1.500đ)'));

        // Chạy lần 2 trong ngày (lịch buổi chiều): không báo lại
        $this->assertSame(0, $this->evaluate('2026-10-14'));
    }

    public function test_change_alert_is_silent_when_price_unchanged(): void
    {
        $this->alert(AlertCondition::Change);
        $this->price('2026-10-13', 138000);
        $this->price('2026-10-14', 138000);

        $this->assertSame(0, $this->evaluate('2026-10-14'));
        Http::assertNothingSent();
    }

    public function test_threshold_alert_fires_on_crossing_and_rearms_after_falling_back(): void
    {
        $this->alert(AlertCondition::Above, 140000);

        $this->price('2026-10-12', 139000);
        $this->assertSame(0, $this->evaluate('2026-10-12'));

        $this->price('2026-10-13', 141000);
        $this->assertSame(1, $this->evaluate('2026-10-13'));

        // Vẫn trên ngưỡng: không báo lặp
        $this->price('2026-10-14', 142000);
        $this->assertSame(0, $this->evaluate('2026-10-14'));

        // Xuống lại rồi vượt lần nữa thì báo tiếp
        $this->price('2026-10-15', 138000);
        $this->assertSame(0, $this->evaluate('2026-10-15'));
        $this->price('2026-10-16', 140000);
        $this->assertSame(1, $this->evaluate('2026-10-16'));
    }

    public function test_below_alert(): void
    {
        $this->alert(AlertCondition::Below, 135000);
        $this->price('2026-10-14', 134000);

        $this->assertSame(1, $this->evaluate('2026-10-14'));
    }

    public function test_unregistered_device_token_is_cleared(): void
    {
        $this->ticket = ['status' => 'error', 'message' => 'not registered', 'details' => ['error' => 'DeviceNotRegistered']];
        $this->alert(AlertCondition::Below, 135000);
        $this->price('2026-10-14', 134000);

        $this->assertSame(0, $this->evaluate('2026-10-14'));
        $this->assertNull($this->device->fresh()->push_token);
    }

    public function test_devices_without_token_are_skipped(): void
    {
        $this->device->update(['push_token' => null]);
        $this->alert(AlertCondition::Below, 135000);
        $this->price('2026-10-14', 134000);

        $this->assertSame(0, $this->evaluate('2026-10-14'));
        Http::assertNothingSent();
    }

    public function test_command_runs(): void
    {
        $this->artisan('alerts:send')->assertSuccessful();
    }

    private function evaluate(string $date): int
    {
        return app(PriceAlertEvaluator::class)->run(CarbonImmutable::parse($date));
    }

    private function alert(AlertCondition $condition, ?int $threshold = null): PriceAlert
    {
        return PriceAlert::factory()->create([
            'device_id' => $this->device->id,
            'product_id' => $this->pepper->id,
            'region_id' => $this->dakLak->id,
            'condition' => $condition,
            'threshold' => $threshold,
        ]);
    }

    private function price(string $date, int $avg): Price
    {
        return Price::factory()->create([
            'product_id' => $this->pepper->id,
            'region_id' => $this->dakLak->id,
            'date' => $date,
            'price_min' => $avg,
            'price_max' => $avg,
            'price_avg' => $avg,
        ]);
    }
}
