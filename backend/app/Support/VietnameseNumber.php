<?php

namespace App\Support;

/**
 * Đọc số tiền thành chữ để in dòng "Bằng chữ" trên phiếu: 1.250.500 → "Một triệu hai trăm năm mươi nghìn năm trăm đồng".
 */
final class VietnameseNumber
{
    private const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

    private const UNITS = ['', ' nghìn', ' triệu', ' tỷ', ' nghìn tỷ', ' triệu tỷ'];

    public static function money(int $amount): string
    {
        $words = self::words($amount);

        return mb_strtoupper(mb_substr($words, 0, 1)).mb_substr($words, 1).' đồng';
    }

    public static function words(int $number): string
    {
        if ($number === 0) {
            return 'không';
        }
        if ($number < 0) {
            return 'âm '.self::words(-$number);
        }

        // Tách nhóm 3 chữ số từ phải sang
        $groups = [];
        while ($number > 0) {
            $groups[] = $number % 1000;
            $number = intdiv($number, 1000);
        }

        $parts = [];
        $top = count($groups) - 1;
        for ($i = $top; $i >= 0; $i--) {
            if ($groups[$i] === 0) {
                continue;
            }
            // Nhóm sau nhóm đầu mà nhỏ hơn 100 thì đọc đủ "không trăm" (1.005.000 → "một triệu không trăm linh năm nghìn")
            $parts[] = self::group($groups[$i], $i < $top).self::UNITS[$i];
        }

        return implode(' ', $parts);
    }

    /** Đọc 1 nhóm 3 chữ số; $full: đọc cả "không trăm" khi chữ số hàng trăm là 0 */
    private static function group(int $n, bool $full): string
    {
        $hundreds = intdiv($n, 100);
        $tens = intdiv($n % 100, 10);
        $ones = $n % 10;
        $words = [];

        if ($hundreds > 0 || $full) {
            $words[] = self::DIGITS[$hundreds].' trăm';
        }

        if ($tens === 0) {
            if ($ones > 0) {
                $words[] = ($hundreds > 0 || $full ? 'linh ' : '').self::DIGITS[$ones];
            }
        } else {
            $words[] = $tens === 1 ? 'mười' : self::DIGITS[$tens].' mươi';
            if ($ones === 1) {
                $words[] = $tens === 1 ? 'một' : 'mốt';
            } elseif ($ones === 4) {
                $words[] = $tens === 1 ? 'bốn' : 'tư';
            } elseif ($ones === 5) {
                $words[] = 'lăm';
            } elseif ($ones > 0) {
                $words[] = self::DIGITS[$ones];
            }
        }

        return implode(' ', $words);
    }
}
