<?php

use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\BuyerController;
use App\Http\Controllers\Api\V1\CatalogController;
use App\Http\Controllers\Api\V1\DealController;
use App\Http\Controllers\Api\V1\DealEntryController;
use App\Http\Controllers\Api\V1\DeviceController;
use App\Http\Controllers\Api\V1\LedgerSyncController;
use App\Http\Controllers\Api\V1\LocalPriceController;
use App\Http\Controllers\Api\V1\PlanController;
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
    Route::get('/plans', [PlanController::class, 'index'])->name('plans.index');
    // Giá quanh 1 vị trí do các điểm mua đã duyệt đăng (không cần đăng nhập)
    Route::get('/local-prices', [LocalPriceController::class, 'index'])->middleware('throttle:60,1')->name('local-prices.index');

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

    Route::middleware([ResolveDevice::class, 'throttle:20,60'])
        ->post('/local-prices/{report}/flag', [LocalPriceController::class, 'flag'])
        ->name('local-prices.flag');

    // Tài khoản (chỉ cần khi bật "lưu cả trên mạng" cho sổ thu chi)
    Route::middleware('throttle:10,1')->group(function () {
        Route::post('/auth/register', [AuthController::class, 'register'])->name('auth.register');
        Route::post('/auth/login', [AuthController::class, 'login'])->name('auth.login');
    });

    Route::middleware(['auth:sanctum', 'throttle:120,1'])->group(function () {
        Route::get('/user', [AuthController::class, 'me'])->name('user');
        Route::post('/auth/logout', [AuthController::class, 'logout'])->name('auth.logout');

        // Khu vực của tôi
        Route::put('/me/location', [LocalPriceController::class, 'saveLocation'])->name('me.location');

        // Điểm mua: hồ sơ (admin duyệt) + đăng giá theo khu vực
        Route::get('/me/buyer', [BuyerController::class, 'show'])->name('buyer.show');
        Route::put('/me/buyer', [BuyerController::class, 'save'])->name('buyer.save');
        Route::get('/me/buyer/prices', [BuyerController::class, 'reports'])->name('buyer.prices.index');
        Route::post('/me/buyer/prices', [BuyerController::class, 'storeReport'])->middleware('throttle:60,1')->name('buyer.prices.store');
        Route::delete('/me/buyer/prices/{report}', [BuyerController::class, 'destroyReport'])->name('buyer.prices.destroy');

        Route::post('/sync/push', [LedgerSyncController::class, 'push'])->name('sync.push');
        Route::get('/sync/pull', [LedgerSyncController::class, 'pull'])->name('sync.pull');
        Route::delete('/ledger', [LedgerSyncController::class, 'destroy'])->name('ledger.destroy');

        // Đơn mua bán chung 2 bên (thương lái / chi nhánh / nông dân)
        Route::get('/deals', [DealController::class, 'index'])->name('deals.index');
        Route::post('/deals', [DealController::class, 'store'])->name('deals.store');
        Route::post('/deals/join', [DealController::class, 'join'])->middleware('throttle:20,1')->name('deals.join');
        Route::get('/deals/{deal}', [DealController::class, 'show'])->name('deals.show');
        Route::patch('/deals/{deal}', [DealController::class, 'update'])->name('deals.update');
        Route::delete('/deals/{deal}', [DealController::class, 'destroy'])->name('deals.destroy');
        Route::put('/deals/{deal}/sources', [DealController::class, 'sources'])->name('deals.sources');
        Route::post('/deals/{deal}/entries', [DealEntryController::class, 'store'])->name('deals.entries.store');
        Route::patch('/deal-entries/{entry}', [DealEntryController::class, 'update'])->name('deal-entries.update');
        Route::delete('/deal-entries/{entry}', [DealEntryController::class, 'destroy'])->name('deal-entries.destroy');
        Route::post('/deal-entries/{entry}/confirm', [DealEntryController::class, 'confirm'])->name('deal-entries.confirm');
        Route::post('/deal-entries/{entry}/dispute', [DealEntryController::class, 'dispute'])->name('deal-entries.dispute');
    });
});
