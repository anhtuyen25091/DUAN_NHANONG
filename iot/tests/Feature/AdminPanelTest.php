<?php

namespace Tests\Feature;

use App\Enums\ReadingSource;
use App\Filament\Resources\Alerts\AlertResource;
use App\Filament\Resources\Devices\DeviceResource;
use App\Filament\Resources\Farms\FarmResource;
use App\Filament\Resources\FieldMaps\FieldMapResource;
use App\Filament\Resources\Metrics\MetricResource;
use App\Filament\Resources\Plots\PlotResource;
use App\Filament\Resources\Thresholds\ThresholdResource;
use App\Filament\Widgets\DeviceReadingsChart;
use App\Filament\Widgets\IotStats;
use App\Filament\Widgets\OfflineDevices;
use App\Models\Device;
use App\Models\Plot;
use App\Models\User;
use App\Services\ReadingIngestor;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Livewire\Livewire;
use Tests\TestCase;

class AdminPanelTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_admins_can_enter(): void
    {
        $this->actingAs(User::factory()->create())->get('/admin')->assertForbidden();
    }

    public function test_pages_render(): void
    {
        $this->seed(DatabaseSeeder::class);
        $plot = Plot::factory()->create();
        $device = Device::factory()->create(['farm_id' => $plot->farm_id, 'plot_id' => $plot->id]);
        app(ReadingIngestor::class)->ingest($device, [['metric' => 'soil_ph', 'value' => 6.3], ['metric' => 'battery', 'value' => 80]], ReadingSource::Simulator);

        $admin = User::factory()->create();
        $admin->forceFill(['is_admin' => true])->save();
        $this->actingAs($admin);

        $this->get('/admin')->assertOk();
        Livewire::test(IotStats::class)->assertSee('Thiết bị trực tuyến')->assertSee('1 / 1');
        Livewire::test(OfflineDevices::class)->assertSee('Mọi thiết bị đều đang gửi dữ liệu');
        Livewire::test(DeviceReadingsChart::class, ['record' => $device])->assertSee('pH đất 7 ngày qua');
        foreach ([FarmResource::class, PlotResource::class, DeviceResource::class, MetricResource::class, ThresholdResource::class, AlertResource::class, FieldMapResource::class] as $resource) {
            $this->get($resource::getUrl())->assertOk();
        }
        $this->get(DeviceResource::getUrl('view', ['record' => $device]))
            ->assertOk()
            ->assertSee($device->uid)
            ->assertSee('pH đất');
    }
}
