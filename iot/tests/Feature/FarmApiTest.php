<?php

namespace Tests\Feature;

use App\Models\Device;
use App\Models\Farm;
use App\Models\Plot;
use App\Models\User;
use Database\Seeders\FieldMapSeeder;
use Database\Seeders\MetricSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class FarmApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed([MetricSeeder::class, FieldMapSeeder::class]);
    }

    public function test_register_and_login(): void
    {
        $this->postJson(route('api.v1.auth.register'), ['name' => 'Chú Ba', 'email' => 'ba@nhanong.vn', 'password' => 'matkhau'])
            ->assertCreated()
            ->assertJsonStructure(['token', 'user' => ['id', 'name', 'email']]);

        $this->postJson(route('api.v1.auth.login'), ['email' => 'ba@nhanong.vn', 'password' => 'sai'])->assertUnprocessable();
        $token = $this->postJson(route('api.v1.auth.login'), ['email' => 'BA@nhanong.vn', 'password' => 'matkhau'])->assertOk()->json('token');

        $this->getJson(route('api.v1.me'), ['Authorization' => 'Bearer '.$token])->assertOk()->assertJsonPath('data.name', 'Chú Ba');
    }

    public function test_guest_gets_401_even_without_accept_header(): void
    {
        $this->get(route('api.v1.farms.index'))->assertUnauthorized();
    }

    public function test_create_farm_plot_and_device(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $farmId = $this->postJson(route('api.v1.farms.store'), ['name' => 'Vườn sầu riêng', 'province' => 'Đắk Lắk'])->assertCreated()->json('data.id');
        $plotId = $this->postJson(route('api.v1.plots.store', $farmId), ['name' => 'Ao 1', 'type' => 'pond', 'crop' => 'Tôm thẻ'])
            ->assertCreated()
            ->assertJsonPath('data.type_label', 'Ao nuôi')
            ->json('data.id');

        $response = $this->postJson(route('api.v1.devices.store'), ['farm_id' => $farmId, 'plot_id' => $plotId, 'name' => 'Đo nước ao 1', 'kind' => 'esp32'])
            ->assertCreated()
            ->assertJsonPath('data.online', false);

        $key = $response->json('api_key');
        $this->assertStringStartsWith('ndk_', $key);
        $this->assertTrue(Device::findByKey($key)->is(Device::query()->find($response->json('data.id'))));
        $this->assertArrayNotHasKey('api_key', $response->json('data'));

        $this->getJson(route('api.v1.farms.index'))->assertOk()->assertJsonPath('data.0.plots.0.name', 'Ao 1');
    }

    public function test_lorawan_device_needs_dev_eui_and_known_profile(): void
    {
        $user = User::factory()->create();
        $farm = Farm::factory()->for($user)->create();
        Sanctum::actingAs($user);

        $this->postJson(route('api.v1.devices.store'), ['farm_id' => $farm->id, 'name' => 'SE01', 'kind' => 'lorawan'])
            ->assertJsonValidationErrors('dev_eui');
        $this->postJson(route('api.v1.devices.store'), ['farm_id' => $farm->id, 'name' => 'SE01', 'kind' => 'lorawan', 'dev_eui' => 'A84041000181C27A', 'profile' => 'khong-co'])
            ->assertJsonValidationErrors('profile');
        $this->postJson(route('api.v1.devices.store'), ['farm_id' => $farm->id, 'name' => 'SE01', 'kind' => 'lorawan', 'dev_eui' => 'A84041000181C27A', 'profile' => 'dragino-se01'])
            ->assertCreated()
            ->assertJsonPath('data.dev_eui', 'a84041000181c27a');
    }

    public function test_rotate_key_invalidates_old_key(): void
    {
        $user = User::factory()->create();
        $device = Device::factory()->for(Farm::factory()->for($user))->create();
        $old = $device->rotateKey();
        Sanctum::actingAs($user);

        $new = $this->postJson(route('api.v1.devices.rotate-key', $device))->assertOk()->json('api_key');

        $this->assertNull(Device::findByKey($old));
        $this->assertNotNull(Device::findByKey($new));
    }

    public function test_cannot_touch_other_users_data(): void
    {
        $farm = Farm::factory()->create();
        $plot = Plot::factory()->for($farm)->create();
        $device = Device::factory()->for($farm)->create();
        Sanctum::actingAs(User::factory()->create());

        $this->putJson(route('api.v1.farms.update', $farm), ['name' => 'Của tôi'])->assertNotFound();
        $this->postJson(route('api.v1.plots.store', $farm), ['name' => 'Lô', 'type' => 'field'])->assertNotFound();
        $this->getJson(route('api.v1.plots.summary', $plot))->assertNotFound();
        $this->getJson(route('api.v1.devices.show', $device))->assertNotFound();
        $this->getJson(route('api.v1.devices.readings', [$device, 'metric' => 'soil_ph']))->assertNotFound();
        $this->postJson(route('api.v1.devices.store'), ['farm_id' => $farm->id, 'name' => 'X', 'kind' => 'esp32'])->assertJsonValidationErrors('farm_id');
        $this->getJson(route('api.v1.devices.index'))->assertOk()->assertJsonCount(0, 'data');
    }
}
