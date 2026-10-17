<?php

namespace App\Shops\Collect;

use App\Crawling\Extraction\Text;

/**
 * Chuẩn hóa để so khớp điểm bán giữa các nguồn: số điện thoại, tên, địa chỉ.
 */
final class ShopNormalizer
{
    /** Từ chung chung trong tên, bỏ đi khi so khớp ("Cửa hàng VTNN Hai Lúa" ≈ "Đại lý phân bón Hai Lúa") */
    private const GENERIC = [
        'ho kinh doanh', 'hkd', 'ho kd', 'cua hang', 'ch', 'dai ly', 'dl', 'cap 1', 'cap 2', 'cong ty', 'cty', 'tnhh', 'mtv', 'co phan', 'cp',
        'dntn', 'doanh nghiep tu nhan', 'doanh nghiep', 'hop tac xa', 'htx', 'co so', 'cs', 'chi nhanh', 'vat tu nong nghiep', 'vat tu', 'vtnn',
        'phan bon', 'thuoc bvtv', 'thuoc bao ve thuc vat', 'bvtv', 'thuoc tru sau', 'nong duoc', 'thu mua', 'nong san', 'kinh doanh', 'buon ban',
        'va', 'thuong mai', 'dich vu', 'tm', 'dv', 'san xuat', 'sx',
    ];

    /**
     * Số điện thoại về dạng 0xxxxxxxxx (lấy số đầu tiên nếu ghi nhiều số). Không ra số hợp lệ thì null.
     */
    public static function phone(?string $text): ?string
    {
        if ($text === null) {
            return null;
        }
        // Tách nhiều số ("0912 345 678 - 0277 3851 234"), gom chữ số của từng số
        foreach (preg_split('/[,;\/]|\s[-–]\s|\s{2,}/u', $text) ?: [] as $part) {
            $digits = (string) preg_replace('/\D/', '', $part);
            if (str_starts_with($digits, '84') && strlen($digits) >= 11) {
                $digits = '0'.substr($digits, 2);
            }
            // Di động 10 số (03, 05, 07, 08, 09), cố định 11 số (02…)
            if (preg_match('/^0[35789]\d{8}$/', $digits) === 1 || preg_match('/^02\d{9}$/', $digits) === 1) {
                return $digits;
            }
        }

        return null;
    }

    /** Tên hiển thị: gọn khoảng trắng, bỏ dấu câu thừa ở 2 đầu */
    public static function displayName(string $name): string
    {
        $name = trim((string) preg_replace('/\s+/u', ' ', $name), " \t\n\r\0\x0B.,;:-–");

        // Tên viết HOA toàn bộ: đổi sang Hoa Đầu Chữ cho dễ đọc
        return mb_strtoupper($name) === $name ? mb_convert_case(mb_strtolower($name), MB_CASE_TITLE) : $name;
    }

    /** Khóa tên để so khớp: không dấu, bỏ từ chung chung; tên chỉ toàn từ chung thì giữ nguyên */
    public static function nameKey(string $name): string
    {
        $text = ' '.str_replace(['.', '-', '/', ';'], ' ', Text::normalize($name)).' ';
        $stripped = $text;
        foreach (self::GENERIC as $word) {
            $stripped = str_replace(' '.$word.' ', ' ', $stripped);
            $stripped = str_replace(' '.$word.' ', ' ', $stripped);
        }
        $stripped = trim((string) preg_replace('/\s+/', ' ', $stripped));

        return $stripped !== '' ? $stripped : trim((string) preg_replace('/\s+/', ' ', $text));
    }

    /** Khóa địa chỉ: không dấu, bỏ chữ "ấp/thôn/xã/huyện…" */
    public static function addressKey(?string $address): string
    {
        if ($address === null) {
            return '';
        }
        $text = ' '.str_replace(['.', '-', '/', ';', ','], ' ', Text::normalize($address)).' ';
        $text = (string) preg_replace('/\s(so|ap|thon|to|khom|khu pho|kp|xa|phuong|p|thi tran|tt|huyen|quan|thi xa|tx|thanh pho|tp|tinh|duong|ql|quoc lo)\s/', ' ', $text);

        return trim((string) preg_replace('/\s+/', ' ', $text));
    }

    /** Độ giống nhau của 2 chuỗi, 0–100 */
    public static function similarity(string $a, string $b): float
    {
        if ($a === '' || $b === '') {
            return 0.0;
        }
        similar_text($a, $b, $percent);

        return $percent;
    }
}
