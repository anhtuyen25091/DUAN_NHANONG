<?php

use App\Http\Controllers\Api\V1\ActuatorController;
use App\Http\Controllers\Api\V1\AlertController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\DeviceCommandController;
use App\Http\Controllers\Api\V1\DeviceController;
use App\Http\Controllers\Api\V1\FarmController;
use App\Http\Controllers\Api\V1\IngestController;
use App\Http\Controllers\Api\V1\LoRaWanController;
use App\Http\Controllers\Api\V1\MetricController;
use App\Http\Controllers\Api\V1\PlotController;
use App\Http\Controllers\Api\V1\PushTokenController;
use App\Http\Controllers\Api\V1\ReadingController;
use App\Http\Controllers\Api\V1\RuleController;
use App\Http\Controllers\Api\V1\ThresholdController;
use App\Http\Middleware\AuthenticateDevice;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->name('api.v1.')->group(function () {
    Route::get('/health', fn () => ['status' => 'ok', 'time' => now()->toIso8601String()])->name('health');
    Route::get('/metrics', [MetricController::class, 'index'])->name('metrics.index');

    // Thiết bị gửi số đo (Authorization: Bearer <khóa thiết bị>)
    Route::middleware([AuthenticateDevice::class, 'throttle:ingest'])->group(function () {
        Route::post('/ingest', [IngestController::class, 'store'])->name('ingest.store');
        Route::post('/ingest/compact', [IngestController::class, 'compact'])->name('ingest.compact');
        Route::get('/device/time', [IngestController::class, 'time'])->name('device.time');
        // Mạch điều khiển relay: lấy lệnh bật / tắt, báo kết quả
        Route::get('/device/commands', [DeviceCommandController::class, 'index'])->name('device.commands');
        Route::post('/device/commands/{command}/ack', [DeviceCommandController::class, 'ack'])->name('device.commands.ack');
    });

    // Không có Internet ở ruộng: điện thoại / SMS / LoRaWAN chuyển dữ liệu lên (xác thực bằng chữ ký hoặc mã bí mật)
    Route::post('/ingest/upload', [IngestController::class, 'upload'])->middleware('throttle:30,1')->name('ingest.upload');
    Route::post('/sms/inbound', [IngestController::class, 'sms'])->middleware('throttle:120,1')->name('sms.inbound');
    Route::post('/lorawan/chirpstack', [LoRaWanController::class, 'chirpstack'])->middleware('throttle:600,1')->name('lorawan.chirpstack');
    Route::post('/lorawan/ttn', [LoRaWanController::class, 'ttn'])->middleware('throttle:600,1')->name('lorawan.ttn');

    Route::middleware('throttle:10,1')->group(function () {
        Route::post('/auth/register', [AuthController::class, 'register'])->name('auth.register');
        Route::post('/auth/login', [AuthController::class, 'login'])->name('auth.login');
    });

    Route::middleware(['auth:sanctum', 'throttle:120,1'])->group(function () {
        Route::post('/auth/logout', [AuthController::class, 'logout'])->name('auth.logout');
        Route::get('/me', [AuthController::class, 'me'])->name('me');
        Route::put('/me/nhanong', [AuthController::class, 'linkNhanong'])->middleware('throttle:20,1')->name('nhanong.link');
        Route::delete('/me/nhanong', [AuthController::class, 'unlinkNhanong'])->name('nhanong.unlink');
        Route::put('/me/push-token', [PushTokenController::class, 'store'])->name('push-token.store');
        Route::delete('/me/push-token', [PushTokenController::class, 'destroy'])->name('push-token.destroy');

        Route::get('/farms', [FarmController::class, 'index'])->name('farms.index');
        Route::post('/farms', [FarmController::class, 'store'])->name('farms.store');
        Route::put('/farms/{farm}', [FarmController::class, 'update'])->name('farms.update');
        Route::delete('/farms/{farm}', [FarmController::class, 'destroy'])->name('farms.destroy');
        Route::get('/farms/{farm}/weather', [FarmController::class, 'weather'])->middleware('throttle:30,1')->name('farms.weather');
        Route::get('/farms/{farm}/rainfall', [FarmController::class, 'rainfall'])->name('farms.rainfall');

        Route::post('/farms/{farm}/plots', [PlotController::class, 'store'])->name('plots.store');
        Route::put('/plots/{plot}', [PlotController::class, 'update'])->name('plots.update');
        Route::delete('/plots/{plot}', [PlotController::class, 'destroy'])->name('plots.destroy');
        Route::get('/plots/{plot}/summary', [PlotController::class, 'summary'])->name('plots.summary');

        Route::get('/plots/{plot}/thresholds', [ThresholdController::class, 'index'])->name('thresholds.index');
        Route::post('/plots/{plot}/thresholds', [ThresholdController::class, 'store'])->name('thresholds.store');
        Route::delete('/thresholds/{threshold}', [ThresholdController::class, 'destroy'])->name('thresholds.destroy');

        Route::get('/devices', [DeviceController::class, 'index'])->name('devices.index');
        Route::get('/device-profiles', [DeviceController::class, 'profiles'])->name('devices.profiles');
        Route::post('/devices', [DeviceController::class, 'store'])->name('devices.store');
        Route::get('/devices/{device}', [DeviceController::class, 'show'])->name('devices.show');
        Route::put('/devices/{device}', [DeviceController::class, 'update'])->name('devices.update');
        Route::delete('/devices/{device}', [DeviceController::class, 'destroy'])->name('devices.destroy');
        Route::post('/devices/{device}/rotate-key', [DeviceController::class, 'rotateKey'])->name('devices.rotate-key');
        Route::get('/devices/{device}/latest', [DeviceController::class, 'latest'])->name('devices.latest');
        Route::get('/devices/{device}/readings', [ReadingController::class, 'index'])->name('devices.readings');

        Route::get('/plots/{plot}/actuators', [ActuatorController::class, 'index'])->name('actuators.index');
        Route::post('/devices/{device}/actuators', [ActuatorController::class, 'store'])->name('actuators.store');
        Route::put('/actuators/{actuator}', [ActuatorController::class, 'update'])->name('actuators.update');
        Route::delete('/actuators/{actuator}', [ActuatorController::class, 'destroy'])->name('actuators.destroy');
        Route::post('/actuators/{actuator}/command', [ActuatorController::class, 'command'])->middleware('throttle:30,1')->name('actuators.command');
        Route::get('/actuators/{actuator}/commands', [ActuatorController::class, 'history'])->name('actuators.history');

        Route::get('/plots/{plot}/rules', [RuleController::class, 'index'])->name('rules.index');
        Route::post('/plots/{plot}/rules', [RuleController::class, 'store'])->name('rules.store');
        Route::put('/rules/{rule}', [RuleController::class, 'update'])->name('rules.update');
        Route::delete('/rules/{rule}', [RuleController::class, 'destroy'])->name('rules.destroy');

        Route::get('/alerts', [AlertController::class, 'index'])->name('alerts.index');
        Route::post('/alerts/{alert}/resolve', [AlertController::class, 'resolve'])->name('alerts.resolve');
    });
});
