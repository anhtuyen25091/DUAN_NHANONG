<?php

namespace Tests\Feature;

use App\Models\Metric;
use Database\Seeders\MetricSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

/**
 * Chạy thật dùng Redis (có serialize), test mặc định dùng cache "array" nên không lộ lỗi unserialize model.
 */
class MetricCacheTest extends TestCase
{
    use RefreshDatabase;

    public function test_metrics_survive_serializing_cache_store(): void
    {
        config(['cache.default' => 'file']);
        Cache::store('file')->forget('metrics.by-code');
        $this->seed(MetricSeeder::class);

        Metric::byCode();
        // Tiến trình mới: bộ nhớ memo trống, phải đọc lại từ file cache
        $this->app->forgetInstance('cache');
        $this->app->forgetInstance('cache.store');
        Cache::clearResolvedInstances();

        $metric = Metric::byCode()['soil_ph'];
        $this->assertInstanceOf(Metric::class, $metric);
        $this->assertTrue($metric->isValid(6.5));
        $this->assertFalse($metric->isValid(15));

        Cache::store('file')->forget('metrics.by-code');
    }
}
