<?php

namespace App\Http\Middleware;

use App\Models\Device;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Thiết bị gửi khóa trong header Authorization: Bearer ndk_... (khóa tạo khi thêm thiết bị, chỉ hiện 1 lần).
 */
class AuthenticateDevice
{
    public function handle(Request $request, Closure $next): Response
    {
        $device = Device::findByKey((string) $request->bearerToken());
        if ($device === null) {
            return response()->json(['message' => 'Khóa thiết bị không đúng.'], 401);
        }

        $request->attributes->set('device', $device);

        return $next($request);
    }

    public static function device(Request $request): Device
    {
        return $request->attributes->get('device');
    }
}
