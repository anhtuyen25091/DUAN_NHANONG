<?php

use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\CatalogController;
use App\Http\Controllers\Api\V1\DeviceController;
use App\Http\Controllers\Api\V1\LedgerSyncController;
use App\Http\Controllers\Api\V1\PriceAlertController;
use App\Http\Controllers\Api\V1\PriceController;
use App\Http\Controllers\Api\V1\ShopController;
use App\Http\Middleware\ResolveDevice;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->name('api.v1.')->group(function () {
    Route::get('/health', fn () => ['status' => 'ok', 'time' => now()->toIso8601String()])->name('health');

    Route::get('/categories', [CatalogController::class, 'categories'])->name('categories');
    Route::get('/regions', [CatalogController::class, 'regions'])->name('regions');
    Route::get('/prices', [PriceController::class, 'index'])->name('prices.index');
    Route::get('/products/{product:code}/history', [PriceController::class, 'history'])->name('prices.history');
    Route::get('/shops', [ShopController::class, 'index'])->name('shops.index');
    Route::get('/provinces', [ShopController::class, 'provinces'])->name('provinces');

    // Không cần đăng nhập: nhận diện máy qua header X-Device-Id
    Route::middleware([ResolveDevice::class, 'throttle:60,1'])->group(function () {
        Route::put('/device', [DeviceController::class, 'update'])->name('device.update');
        Route::get('/alerts', [PriceAlertController::class, 'index'])->name('alerts.index');
        Route::post('/alerts', [PriceAlertController::class, 'store'])->name('alerts.store');
        Route::delete('/alerts/{alert}', [PriceAlertController::class, 'destroy'])->name('alerts.destroy');
    });

    Route::middleware([ResolveDevice::class, 'throttle:10,60'])
        ->post('/shop-submissions', [ShopController::class, 'submit'])
        ->name('shops.submit');

    // Tài khoản (chỉ cần khi bật "lưu cả trên mạng" cho sổ thu chi)
    Route::middleware('throttle:10,1')->group(function () {
        Route::post('/auth/register', [AuthController::class, 'register'])->name('auth.register');
        Route::post('/auth/login', [AuthController::class, 'login'])->name('auth.login');
    });

    Route::middleware(['auth:sanctum', 'throttle:120,1'])->group(function () {
        Route::get('/user', [AuthController::class, 'me'])->name('user');
        Route::post('/auth/logout', [AuthController::class, 'logout'])->name('auth.logout');

        Route::post('/sync/push', [LedgerSyncController::class, 'push'])->name('sync.push');
        Route::get('/sync/pull', [LedgerSyncController::class, 'pull'])->name('sync.pull');
        Route::delete('/ledger', [LedgerSyncController::class, 'destroy'])->name('ledger.destroy');
    });
});
