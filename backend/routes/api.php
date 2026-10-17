<?php

use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\BusinessController;
use App\Http\Controllers\Api\V1\BuyerController;
use App\Http\Controllers\Api\V1\CatalogController;
use App\Http\Controllers\Api\V1\CustomerController;
use App\Http\Controllers\Api\V1\DealController;
use App\Http\Controllers\Api\V1\DealEntryController;
use App\Http\Controllers\Api\V1\DeviceController;
use App\Http\Controllers\Api\V1\LedgerSyncController;
use App\Http\Controllers\Api\V1\LocalPriceController;
use App\Http\Controllers\Api\V1\PlanController;
use App\Http\Controllers\Api\V1\PriceAlertController;
use App\Http\Controllers\Api\V1\PriceController;
use App\Http\Controllers\Api\V1\PurchaseController;
use App\Http\Controllers\Api\V1\ReceiptPhotoController;
use App\Http\Controllers\Api\V1\ShopController;
use App\Http\Controllers\Api\V1\TransactionController;
use App\Http\Middleware\ResolveDevice;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->name('api.v1.')->group(function () {
    Route::get('/health', fn () => ['status' => 'ok', 'time' => now()->toIso8601String()])->name('health');

    Route::get('/categories', [CatalogController::class, 'categories'])->name('categories');
    Route::get('/regions', [CatalogController::class, 'regions'])->name('regions');
    Route::get('/prices', [PriceController::class, 'index'])->name('prices.index');
    Route::get('/products/{product:code}/history', [PriceController::class, 'history'])->name('prices.history');
    Route::get('/shops', [ShopController::class, 'index'])->name('shops.index');
    Route::get('/shops/map', [ShopController::class, 'map'])->name('shops.map');
    Route::get('/provinces', [ShopController::class, 'provinces'])->name('provinces');
    Route::get('/plans', [PlanController::class, 'index'])->name('plans.index');
    // Giá quanh 1 vị trí do các điểm mua đã duyệt đăng (không cần đăng nhập)
    Route::get('/local-prices', [LocalPriceController::class, 'index'])->middleware('throttle:60,1')->name('local-prices.index');
    Route::get('/places', [LocalPriceController::class, 'places'])->middleware('throttle:places')->name('places.index');

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
        Route::post('/me/buyer/prices', [BuyerController::class, 'storeReport'])->middleware('throttle:buyer-prices')->name('buyer.prices.store');
        Route::delete('/me/buyer/prices/{report}', [BuyerController::class, 'destroyReport'])->name('buyer.prices.destroy');

        Route::post('/sync/push', [LedgerSyncController::class, 'push'])->name('sync.push');
        Route::get('/sync/pull', [LedgerSyncController::class, 'pull'])->name('sync.pull');
        Route::delete('/ledger', [LedgerSyncController::class, 'destroy'])->name('ledger.destroy');
        // Ảnh hóa đơn của sổ (id = uuid do máy tạo)
        Route::put('/sync/photos/{photo}', [ReceiptPhotoController::class, 'store'])->whereUuid('photo')->middleware('throttle:60,1')->name('sync.photos.store');
        Route::get('/sync/photos/{photo}', [ReceiptPhotoController::class, 'show'])->whereUuid('photo')->name('sync.photos.show');

        // Đơn mua bán chung 2 bên (thương lái / chi nhánh / nông dân)
        Route::get('/deals', [DealController::class, 'index'])->name('deals.index');
        Route::post('/deals', [DealController::class, 'store'])->name('deals.store');
        Route::post('/deals/join', [DealController::class, 'join'])->middleware('throttle:deal-join')->name('deals.join');
        Route::get('/deals/{deal}', [DealController::class, 'show'])->name('deals.show');
        Route::patch('/deals/{deal}', [DealController::class, 'update'])->name('deals.update');
        Route::delete('/deals/{deal}', [DealController::class, 'destroy'])->name('deals.destroy');
        Route::put('/deals/{deal}/sources', [DealController::class, 'sources'])->name('deals.sources');
        Route::post('/deals/{deal}/entries', [DealEntryController::class, 'store'])->name('deals.entries.store');
        Route::patch('/deal-entries/{entry}', [DealEntryController::class, 'update'])->name('deal-entries.update');
        Route::delete('/deal-entries/{entry}', [DealEntryController::class, 'destroy'])->name('deal-entries.destroy');
        Route::post('/deal-entries/{entry}/confirm', [DealEntryController::class, 'confirm'])->name('deal-entries.confirm');
        Route::post('/deal-entries/{entry}/dispute', [DealEntryController::class, 'dispute'])->name('deal-entries.dispute');

        // Sổ giao dịch của điểm thu mua: khách, phiếu mua / bán, in PDF / Word
        Route::get('/customers', [CustomerController::class, 'index'])->name('customers.index');
        Route::post('/customers', [CustomerController::class, 'store'])->name('customers.store');
        Route::patch('/customers/{customer}', [CustomerController::class, 'update'])->name('customers.update');
        Route::delete('/customers/{customer}', [CustomerController::class, 'destroy'])->name('customers.destroy');
        Route::post('/purchases', [PurchaseController::class, 'store'])->name('purchases.store');
        Route::get('/purchases/{purchase}', [PurchaseController::class, 'show'])->name('purchases.show');
        Route::patch('/purchases/{purchase}', [PurchaseController::class, 'update'])->name('purchases.update');
        Route::delete('/purchases/{purchase}', [PurchaseController::class, 'destroy'])->name('purchases.destroy');
        Route::post('/purchases/{purchase}/share', [PurchaseController::class, 'share'])->name('purchases.share');
        Route::delete('/purchases/{purchase}/share', [PurchaseController::class, 'unshare'])->name('purchases.unshare');
        Route::post('/purchases/{purchase}/send', [PurchaseController::class, 'sendToAccount'])->name('purchases.send');
        Route::post('/received-purchases', [PurchaseController::class, 'receive'])->middleware('throttle:deal-join')->name('received-purchases.receive');
        Route::get('/received-purchases', [PurchaseController::class, 'received'])->name('received-purchases.index');
        Route::get('/received-purchases/{purchase}', [PurchaseController::class, 'showReceived'])->name('received-purchases.show');
        Route::get('/transactions', [TransactionController::class, 'index'])->name('transactions.index');
        Route::get('/transactions/summary', [TransactionController::class, 'summary'])->name('transactions.summary');

        // Doanh nghiệp thu mua: chủ + lái con
        Route::get('/business', [BusinessController::class, 'show'])->name('business.show');
        Route::post('/business', [BusinessController::class, 'store'])->name('business.store');
        Route::patch('/business', [BusinessController::class, 'update'])->name('business.update');
        Route::post('/business/members', [BusinessController::class, 'createMember'])->middleware('throttle:deal-join')->name('business.members.store');
        Route::patch('/business/members/{user}', [BusinessController::class, 'updateMember'])->name('business.members.update');
        Route::delete('/business/members/{user}', [BusinessController::class, 'removeMember'])->name('business.members.destroy');
        Route::post('/business/invite', [BusinessController::class, 'invite'])->name('business.invite');
        Route::delete('/business/invite', [BusinessController::class, 'revokeInvite'])->name('business.invite.revoke');
        Route::post('/business/join', [BusinessController::class, 'join'])->middleware('throttle:deal-join')->name('business.join');
        Route::post('/business/leave', [BusinessController::class, 'leave'])->name('business.leave');
        Route::get('/business/summary', [BusinessController::class, 'summary'])->name('business.summary');
        Route::get('/business/transactions', [BusinessController::class, 'transactions'])->name('business.transactions');
        Route::get('/business/deals', [BusinessController::class, 'deals'])->name('business.deals');
        Route::get('/business/activity', [BusinessController::class, 'activity'])->name('business.activity');
        Route::get('/business/advances', [BusinessController::class, 'advances'])->name('business.advances.index');
        Route::post('/business/advances', [BusinessController::class, 'storeAdvance'])->name('business.advances.store');
        Route::delete('/business/advances/{advance}', [BusinessController::class, 'destroyAdvance'])->name('business.advances.destroy');
        Route::middleware('throttle:documents')->prefix('documents')->name('documents.')->group(function () {
            Route::get('/purchases/{purchase}', [TransactionController::class, 'purchaseDocument'])->name('purchase');
            Route::get('/deal-entries/{entry}', [TransactionController::class, 'dealEntryDocument'])->name('deal-entry');
            Route::get('/deals/{deal}', [TransactionController::class, 'dealDocument'])->name('deal');
            Route::get('/customers/{customer}', [TransactionController::class, 'customerDocument'])->name('customer');
            Route::get('/report', [TransactionController::class, 'reportDocument'])->name('report');
            Route::get('/business-report', [TransactionController::class, 'businessReportDocument'])->name('business-report');
        });
    });
});
