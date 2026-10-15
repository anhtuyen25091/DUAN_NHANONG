<?php

namespace App\Crawling\Extraction;

use Illuminate\Support\Str;

/**
 * Chuẩn hóa chữ tiếng Việt để so khớp: bỏ dấu, chữ thường, gom khoảng trắng.
 * Giữ lại số, dấu chấm, gạch ngang, gạch chéo để vẫn đọc được giá ("93.200 dong/kg").
 */
final class Text
{
    public static function normalize(string $text): string
    {
        $text = Str::lower(Str::ascii($text));
        $text = preg_replace('/[^a-z0-9.\/\-;]+/', ' ', $text) ?? '';

        return trim(preg_replace('/\s+/', ' ', $text) ?? '');
    }

    /**
     * Đọc số tiền viết kiểu Việt Nam: "1.245.000" -> 1245000.
     */
    public static function toInt(string $number): int
    {
        return (int) str_replace('.', '', $number);
    }
}
