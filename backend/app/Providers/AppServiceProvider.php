<?php

namespace App\Providers;

use App\Crawling\Fetcher;
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
        //
    }
}
