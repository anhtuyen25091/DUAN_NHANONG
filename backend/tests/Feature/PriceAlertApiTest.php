<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\V1\PriceAlertController;
use App\Models\Device;
use App\Models\PriceAlert;
use App\Models\Product;
use Database\Seeders\CatalogSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PriceAlertApiTest extends TestCase
{
    use RefreshDatabase;

    private const UUID = '0b7c1f0e-8a2e-4c55-9d1e-3f4a5b6c7d8e';

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(CatalogSeeder::class);
    }

    public function test_device_id_header_is_required(): void
    {
        $this->getJson(route('api.v1.alerts.index'))->assertStatus(400);
        $this->getJson(route('api.v1.alerts.index'), ['X-Device-Id' => 'abc'])->assertStatus(400);
    }

    public function test_register_push_token(): void
    {
        $this->putJson(route('api.v1.device.update'), ['push_token' => 'ExponentPushToken[abc123]', 'platform' => 'android'], $this->headers())
            ->assertOk()
            ->assertJsonPath('data.push_enabled', true);

        $this->assertDatabaseHas('devices', ['uuid' => self::UUID, 'push_token' => 'ExponentPushToken[abc123]', 'platform' => 'android']);

        $this->putJson(route('api.v1.device.update'), ['push_token' => 'not-a-token'], $this->headers())
            ->assertUnprocessable()
            ->assertJsonValidationErrors('push_token');
    }

    public function test_token_moved_to_new_install_is_removed_from_old_device(): void
    {
        $old = Device::factory()->create(['push_token' => 'ExponentPushToken[same]']);

        $this->putJson(route('api.v1.device.update'), ['push_token' => 'ExponentPushToken[same]'], $this->headers())->assertOk();

        $this->assertNull($old->fresh()->push_token);
    }

    public function test_create_list_and_delete_alerts(): void
    {
        $this->postJson(route('api.v1.alerts.store'), ['product' => 'ho-tieu', 'region' => 'dak-lak', 'condition' => 'above', 'threshold' => 150000], $this->headers())
            ->assertCreated()
            ->assertJsonPath('data.product.code', 'ho-tieu')
            ->assertJsonPath('data.region.code', 'dak-lak')
            ->assertJsonPath('data.threshold', 150000);

        // Đặt trùng thì không tạo thêm
        $this->postJson(route('api.v1.alerts.store'), ['product' => 'ho-tieu', 'region' => 'dak-lak', 'condition' => 'above', 'threshold' => 150000], $this->headers())
            ->assertOk();

        $id = $this->getJson(route('api.v1.alerts.index'), $this->headers())
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->json('data.0.id');

        $this->deleteJson(route('api.v1.alerts.destroy', $id), [], $this->headers())->assertNoContent();
        $this->assertDatabaseCount('price_alerts', 0);
    }

    public function test_threshold_rules_depend_on_condition(): void
    {
        $this->postJson(route('api.v1.alerts.store'), ['product' => 'ho-tieu', 'condition' => 'below'], $this->headers())
            ->assertJsonValidationErrors('threshold');

        $this->postJson(route('api.v1.alerts.store'), ['product' => 'ho-tieu', 'condition' => 'change', 'threshold' => 1000], $this->headers())
            ->assertJsonValidationErrors('threshold');

        $this->postJson(route('api.v1.alerts.store'), ['product' => 'ho-tieu', 'condition' => 'change'], $this->headers())
            ->assertCreated()
            ->assertJsonPath('data.region', null);
    }

    public function test_cannot_delete_other_devices_alert(): void
    {
        $alert = PriceAlert::factory()->create();

        $this->deleteJson(route('api.v1.alerts.destroy', $alert), [], $this->headers())->assertNotFound();
        $this->assertModelExists($alert);
    }

    public function test_alert_limit_per_device(): void
    {
        $device = Device::factory()->create(['uuid' => self::UUID]);
        $product = Product::query()->where('code', 'ho-tieu')->firstOrFail();
        PriceAlert::factory()->count(PriceAlertController::MAX_PER_DEVICE)->sequence(fn ($sequence) => ['threshold' => $sequence->index + 1])
            ->create(['device_id' => $device->id, 'product_id' => $product->id, 'condition' => 'above']);

        $this->postJson(route('api.v1.alerts.store'), ['product' => 'ho-tieu', 'condition' => 'change'], $this->headers())
            ->assertUnprocessable();
    }

    /**
     * @return array<string, string>
     */
    private function headers(): array
    {
        return ['X-Device-Id' => self::UUID];
    }
}
