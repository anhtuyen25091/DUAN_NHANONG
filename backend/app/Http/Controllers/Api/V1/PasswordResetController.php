<?php

namespace App\Http\Controllers\Api\V1;

use App\Auth\PhoneVerifier;
use App\Http\Controllers\Controller;
use App\Models\PhoneVerification;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Quên mật khẩu: xác minh số điện thoại bằng SMS ngược (PhoneVerifier) rồi đặt mật khẩu mới.
 * 1) POST /auth/password/forgot {phone} → mã + số cần nhắn
 * 2) app hỏi GET /auth/password/forgot/{id} tới khi status = verified
 * 3) POST /auth/password/reset {id, password} → đăng nhập luôn (đăng xuất mọi máy khác)
 */
class PasswordResetController extends Controller
{
    public function start(Request $request, PhoneVerifier $verifier): JsonResponse
    {
        $phone = User::normalizePhone($request->validate(['phone' => ['required', 'string', 'max:20']])['phone']);
        if ($phone === null) {
            throw ValidationException::withMessages(['phone' => 'Số điện thoại chưa đúng (10 số, bắt đầu bằng 0).']);
        }
        if (! User::query()->where('phone', $phone)->exists()) {
            throw ValidationException::withMessages(['phone' => 'Số điện thoại này chưa có tài khoản. Hãy đăng ký.']);
        }
        $number = (string) config('nhanong.sms.inbound_number');
        if ($number === '') {
            abort(503, 'Chức năng lấy lại mật khẩu đang tạm dừng. Liên hệ hỗ trợ.');
        }

        $verification = $verifier->start($phone);

        return response()->json(['data' => [
            ...self::present($verification),
            'sms_to' => $number,
            'sms_text' => PhoneVerifier::smsText($verification),
        ]], 201);
    }

    public function status(PhoneVerification $verification): JsonResponse
    {
        return response()->json(['data' => self::present($verification)]);
    }

    public function reset(Request $request): JsonResponse
    {
        $data = $request->validate([
            'id' => ['required', 'uuid'],
            'password' => ['required', 'string', 'min:6', 'max:100'],
            'device_name' => ['nullable', 'string', 'max:100'],
        ], ['password.min' => 'Mật khẩu cần ít nhất 6 ký tự.']);

        $verification = PhoneVerification::query()->where('uuid', $data['id'])->first();
        // Đã nhận SMS, chưa dùng, và đặt mật khẩu trong vòng 15 phút kể từ lúc xác minh
        if ($verification === null || $verification->status !== 'verified' || $verification->verified_at->addMinutes((int) config('nhanong.sms.ttl_minutes', 15))->isPast()) {
            throw ValidationException::withMessages(['id' => 'Chưa xác nhận được số điện thoại, hoặc đã quá hạn. Hãy làm lại.']);
        }
        $user = User::query()->where('phone', $verification->phone)->firstOrFail();

        $user->update(['password' => $data['password']]);
        // Mật khẩu có thể đã lộ: đăng xuất mọi máy, chỉ giữ máy vừa đặt lại
        $user->tokens()->delete();
        $verification->update(['status' => 'used']);
        $token = $user->createToken($data['device_name'] ?? 'app', ['ledger'])->plainTextToken;

        return response()->json(['token' => $token, 'user' => AuthController::userData($user)]);
    }

    /**
     * @return array{id: string, phone: string, status: string, expires_at: string}
     */
    private static function present(PhoneVerification $v): array
    {
        return [
            'id' => $v->uuid,
            // Che bớt số: 09****5678
            'phone' => substr($v->phone, 0, 2).'****'.substr($v->phone, -4),
            'status' => $v->status === 'pending' && $v->isExpired() ? 'expired' : $v->status,
            'expires_at' => $v->expires_at->toIso8601String(),
        ];
    }
}
