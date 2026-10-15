<?php

namespace App\Support;

use App\Models\User;
use Carbon\CarbonImmutable;

/**
 * Mức xem lịch sử giá: khách (chưa đăng nhập), thành viên (đã đăng ký), có gói (trả phí còn hạn).
 */
final class PriceAccess
{
    public const GUEST = 'guest';

    public const MEMBER = 'member';

    public const PREMIUM = 'premium';

    public static function tier(?User $user): string
    {
        if ($user === null) {
            return self::GUEST;
        }

        return $user->hasPremium() ? self::PREMIUM : self::MEMBER;
    }

    /** Số ngày gần nhất được xem; null = không giới hạn */
    public static function maxDays(string $tier): ?int
    {
        return match ($tier) {
            self::GUEST => config('nhanong.price_history.guest_days'),
            self::MEMBER => config('nhanong.price_history.member_days'),
            default => null,
        };
    }

    /** Ngày sớm nhất được xem (tính từ hôm nay); null = không giới hạn */
    public static function earliestDate(string $tier): ?CarbonImmutable
    {
        $days = self::maxDays($tier);

        return $days === null ? null : CarbonImmutable::today()->subDays($days - 1);
    }
}
