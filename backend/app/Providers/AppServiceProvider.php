<?php

namespace App\Providers;

use App\Crawling\Fetcher;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Dùng chung 1 Fetcher trong mỗi lần chạy để giãn cách request theo host
        $this->app->singleton(Fetcher::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Giới hạn riêng cho từng việc nặng / dễ bị dò. Đặt tên riêng để có bộ đếm riêng:
        // "throttle:30,1" lồng trong nhóm "throttle:120,1" sẽ dùng chung bộ đếm theo người dùng,
        // nên chỉ việc app hỏi đơn mới mỗi 8 giây cũng làm hết lượt.
        foreach (['documents' => 30, 'places' => 30, 'deal-join' => 20, 'buyer-prices' => 60] as $name => $perMinute) {
            RateLimiter::for($name, fn (Request $request) => Limit::perMinute($perMinute)->by($name.':'.($request->user()?->id ?? $request->ip())));
        }
    }
}
