<?php

namespace Tests\Feature;

use App\Models\Device;
use App\Models\Farm;
use App\Models\Plot;
use App\Models\PlotEvent;
use App\Models\Reading;
use App\Models\User;
use Database\Seeders\MetricSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Lệnh iot:demo: tạo dữ liệu demo cho 1 tài khoản, chạy lại không nhân đôi, --remove chỉ xóa phần demo.
 */
class SeedDemoTest extends TestCase
{
    use RefreshDatabase;

    public function test_creates_demo_data_reruns_cleanly_and_removes_only_demo_data(): void
    {
        $this->seed(MetricSeeder::class);
        Http::fake(['*' => Http::response(['hourly' => ['time' => [], 'precipitation' => []], 'daily' => ['time' => [], 'precipitation_sum' => []]])]);
        $owner = User::factory()->create(['email' => null]);
        $owner->forceFill(['nhanong_phone' => '0900000001'])->save();
        $garden = Farm::factory()->for($owner)->create(['name' => 'Vườn của chú Ba']);
        $ownPlot = Plot::factory()->for($garden)->create(['name' => 'Lô tự tạo']);

        $this->artisan('iot:demo', ['phone' => '0900000001', '--days' => 2])->assertSuccessful();
        $counts = [Plot::query()->count(), Device::query()->count(), Reading::query()->count(), PlotEvent::query()->count()];

        $this->assertSame(6, $counts[0]);
        $this->assertSame(6, Device::query()->where('uid', 'like', 'NDDEMO%')->count());
        $this->assertGreaterThan(1000, $counts[2]);
        // Vừa phun thuốc ở vườn thứ 2 (hoặc vườn đầu khi chỉ có 1 vườn): còn cấm vào lô
        $this->assertTrue(PlotEvent::query()->where('kind', PlotEvent::SPRAY)->where('done_at', '>', now()->subHours(4))->exists());

        $this->artisan('iot:demo', ['phone' => '0900000001', '--days' => 2])->assertSuccessful();
        $this->assertSame($counts, [Plot::query()->count(), Device::query()->count(), Reading::query()->count(), PlotEvent::query()->count()]);

        $this->artisan('iot:demo', ['phone' => '0900000001', '--remove' => true])->assertSuccessful();
        $this->assertSame([$ownPlot->id], Plot::query()->pluck('id')->all());
        $this->assertSame([$garden->id], Farm::query()->pluck('id')->all());
        $this->assertSame(0, Reading::query()->count());
    }

    public function test_unknown_phone_fails(): void
    {
        $this->artisan('iot:demo', ['phone' => '0999999999'])->assertFailed();
    }
}
