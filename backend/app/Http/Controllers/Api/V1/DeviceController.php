<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\DeviceUpdateRequest;
use App\Models\Device;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DeviceController extends Controller
{
    /**
     * Lưu push token của máy (gọi mỗi lần mở app vì token có thể đổi).
     */
    public function update(DeviceUpdateRequest $request): JsonResponse
    {
        $device = self::device($request);
        $token = $request->validated('push_token');

        if ($token !== null) {
            // Token chuyển sang uuid mới (cài lại app): bỏ ở máy cũ để không báo trùng
            Device::query()->where('push_token', $token)->whereKeyNot($device->id)->update(['push_token' => null]);
        }

        $device->update([
            'push_token' => $token,
            'platform' => $request->validated('platform') ?? $device->platform,
        ]);
        // Gửi kèm token đăng nhập: gắn máy với tài khoản để nhận thông báo đơn / phiếu; không kèm (đã đăng xuất) thì gỡ
        $device->forceFill(['user_id' => auth('sanctum')->id()])->save();

        return response()->json(['data' => [
            'uuid' => $device->uuid,
            'push_enabled' => $device->push_token !== null,
        ]]);
    }

    public static function device(Request $request): Device
    {
        return $request->attributes->get('device');
    }
}
