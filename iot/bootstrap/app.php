<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Nội dung file dữ liệu được ký HMAC: cắt khoảng trắng là sai chữ ký
        $middleware->trimStrings(except: ['content']);
        // API chưa đăng nhập trả 401 (kể cả khi thiếu header Accept), không chuyển hướng tới trang đăng nhập
        $middleware->redirectGuestsTo(fn (Request $request) => $request->is('api/*') ? null : route('filament.admin.auth.login'));
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
