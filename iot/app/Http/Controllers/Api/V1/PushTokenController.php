<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\PushToken;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * App gửi Expo push token sau khi đăng nhập để nhận thông báo khi số đo vượt ngưỡng.
 */
class PushTokenController extends Controller
{
    public function store(Request $request): Response
    {
        $data = $request->validate([
            'token' => ['required', 'string', 'max:191', 'regex:/^Expo(nent)?PushToken\[.+\]$/'],
            'platform' => ['nullable', 'in:android,ios'],
        ], ['token.regex' => 'Token thông báo không hợp lệ.']);

        // Máy đổi tài khoản thì token chuyển sang tài khoản mới
        PushToken::query()->updateOrCreate(
            ['token' => $data['token']],
            ['user_id' => $request->user()->id, 'platform' => $data['platform'] ?? null],
        );

        return response()->noContent();
    }

    public function destroy(Request $request): Response
    {
        $request->user()->pushTokens()->where('token', $request->input('token'))->delete();

        return response()->noContent();
    }
}
