<?php

namespace App\Support;

use App\Models\Device;
use App\Models\Farm;
use App\Models\Plot;
use Illuminate\Http\Request;

/**
 * Người dùng chỉ thấy trang trại / lô / thiết bị của mình. Của người khác thì trả 404 như không tồn tại.
 */
final class Ownership
{
    public static function farm(Request $request, Farm $farm): Farm
    {
        abort_unless($farm->user_id === $request->user()->id, 404);

        return $farm;
    }

    public static function plot(Request $request, Plot $plot): Plot
    {
        abort_unless($plot->farm->user_id === $request->user()->id, 404);

        return $plot;
    }

    public static function device(Request $request, Device $device): Device
    {
        abort_unless($device->farm->user_id === $request->user()->id, 404);

        return $device;
    }
}
