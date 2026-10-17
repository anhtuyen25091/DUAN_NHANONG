<?php

namespace App\Http\Controllers\Api\V1;

use App\Auth\PhoneVerifier;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Webhook nhận SMS (thiết bị chuyển tiếp SMS / dịch vụ SMS 2 chiều gọi tới): {from, text}, kèm header X-Sms-Secret.
 */
class SmsInboundController extends Controller
{
    public function __invoke(Request $request, PhoneVerifier $verifier): JsonResponse
    {
        $secret = (string) config('nhanong.sms.inbound_secret');
        abort_if($secret === '' || ! hash_equals($secret, (string) $request->header('X-Sms-Secret')), 403);

        $data = $request->validate(['from' => ['required', 'string', 'max:30'], 'text' => ['required', 'string', 'max:500']]);
        $verification = $verifier->receive($data['from'], $data['text']);

        return response()->json(['matched' => $verification !== null]);
    }
}
