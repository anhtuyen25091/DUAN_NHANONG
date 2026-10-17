<?php

namespace App\Auth;

use App\Models\PhoneVerification;
use App\Models\User;

/**
 * Xác minh số điện thoại bằng SMS ngược: người dùng nhắn "NN 482913" từ chính số đó tới số của hệ thống
 * (config nhanong.sms.inbound_number), người dùng tự trả phí tin nhắn. Không phụ thuộc nhà cung cấp:
 * thiết bị nhận SMS (điện thoại Android cài app chuyển tiếp) hoặc dịch vụ SMS 2 chiều gọi webhook POST /sms/inbound.
 */
class PhoneVerifier
{
    public function start(string $phone, string $purpose = 'reset'): PhoneVerification
    {
        // Mỗi số chỉ giữ 1 yêu cầu đang chờ: tạo mới thì bỏ yêu cầu cũ
        PhoneVerification::query()->where('phone', $phone)->where('status', 'pending')->update(['status' => 'expired']);

        return PhoneVerification::query()->create([
            'phone' => $phone,
            'code' => str_pad((string) random_int(0, 999_999), 6, '0', STR_PAD_LEFT),
            'purpose' => $purpose,
            'status' => 'pending',
            'expires_at' => now()->addMinutes((int) config('nhanong.sms.ttl_minutes', 15)),
        ]);
    }

    /** Nội dung tin người dùng cần nhắn */
    public static function smsText(PhoneVerification $v): string
    {
        return config('nhanong.sms.keyword', 'NN').' '.$v->code;
    }

    /**
     * Tin nhắn đến (từ webhook): khớp số gửi + mã của yêu cầu đang chờ, còn hạn. Trả yêu cầu đã xác minh, không khớp thì null.
     */
    public function receive(string $from, string $text): ?PhoneVerification
    {
        $phone = User::normalizePhone($from);
        $keyword = preg_quote((string) config('nhanong.sms.keyword', 'NN'), '/');
        if ($phone === null || preg_match('/\b'.$keyword.'\s*(\d{6})\b/iu', $text, $m) !== 1) {
            return null;
        }

        $verification = PhoneVerification::query()
            ->where('phone', $phone)
            ->where('code', $m[1])
            ->where('status', 'pending')
            ->where('expires_at', '>', now())
            ->latest('id')
            ->first();
        $verification?->update(['status' => 'verified', 'verified_at' => now()]);

        return $verification;
    }
}
