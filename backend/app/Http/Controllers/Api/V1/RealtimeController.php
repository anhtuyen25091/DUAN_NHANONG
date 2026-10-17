<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Realtime\Realtime;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Vé tạm để app kết nối Ably; chưa cấu hình Ably thì trả enabled = false (app dùng cách hỏi định kỳ) */
class RealtimeController extends Controller
{
    public function token(Request $request, Realtime $realtime): JsonResponse
    {
        if (! $realtime->enabled()) {
            return response()->json(['enabled' => false]);
        }

        return response()->json([
            'enabled' => true,
            'channel' => Realtime::channel($request->user()->id),
            'token_request' => $realtime->tokenRequest($request->user()),
        ]);
    }
}
