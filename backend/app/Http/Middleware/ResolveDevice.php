<?php

namespace App\Http\Middleware;

use App\Models\Device;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

/**
 * Nhận diện máy qua header X-Device-Id (uuid app tự sinh). Lần đầu gặp thì tạo bản ghi.
 */
class ResolveDevice
{
    public const HEADER = 'X-Device-Id';

    public function handle(Request $request, Closure $next): Response
    {
        $uuid = (string) $request->header(self::HEADER);
        if (! Str::isUuid($uuid)) {
            return response()->json(['message' => 'Thiếu hoặc sai header '.self::HEADER.'.'], 400);
        }

        $device = Device::query()->firstOrCreate(['uuid' => strtolower($uuid)]);
        if ($device->last_seen_at === null || $device->last_seen_at->lt(now()->subHour())) {
            $device->update(['last_seen_at' => now()]);
        }

        $request->attributes->set('device', $device);

        return $next($request);
    }
}
