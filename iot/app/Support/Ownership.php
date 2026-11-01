<?php

namespace App\Support;

use App\Models\Device;
use App\Models\Farm;
use App\Models\Plot;
use Illuminate\Http\Request;

/**
 * Quyền với trang trại / lô / thiết bị:
 * - VIEW: chủ + mọi người được chia sẻ (xem số đo, thời tiết, lịch sử)
 * - CONTROL: chủ + người được bật / tắt máy (operator): bật / tắt, xử lý cảnh báo
 * - MANAGE: chỉ chủ trang trại (thêm / sửa / xóa)
 * Không liên quan thì trả 404 như không tồn tại; được xem nhưng thiếu quyền thì 403.
 */
final class Ownership
{
    public const VIEW = 'view';

    public const CONTROL = 'control';

    public const MANAGE = 'manage';

    private const ALLOWED = [
        self::VIEW => ['owner', 'operator', 'viewer'],
        self::CONTROL => ['owner', 'operator'],
        self::MANAGE => ['owner'],
    ];

    public static function farm(Request $request, Farm $farm, string $ability = self::MANAGE): Farm
    {
        $role = $farm->roleOf($request->user());
        abort_if($role === null, 404);
        abort_unless(in_array($role, self::ALLOWED[$ability], true), 403, $ability === self::CONTROL
            ? 'Bạn chỉ được xem trang trại này, không được bật / tắt máy.'
            : 'Chỉ chủ trang trại được thêm / sửa / xóa.');

        return $farm;
    }

    public static function plot(Request $request, Plot $plot, string $ability = self::MANAGE): Plot
    {
        self::farm($request, $plot->farm, $ability);

        return $plot;
    }

    public static function device(Request $request, Device $device, string $ability = self::MANAGE): Device
    {
        self::farm($request, $device->farm, $ability);

        return $device;
    }
}
