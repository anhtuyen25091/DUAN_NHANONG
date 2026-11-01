<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        // Đếm theo khóa thiết bị (nhiều thiết bị có thể chung 1 IP qua router 4G). Throttle chạy trước bước xác thực khóa.
        RateLimiter::for('ingest', fn (Request $request) => Limit::perMinute(120)->by('ingest:'.hash('sha256', (string) ($request->bearerToken() ?? $request->ip()))));
    }
}
