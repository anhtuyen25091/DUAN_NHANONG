<?php

namespace App\Support;

use App\Crawling\Extraction\Text;

/**
 * 34 tỉnh/thành sau sắp xếp đơn vị hành chính (Nghị quyết 202/2025/QH15, hiệu lực 01/07/2025).
 * Kèm tên các tỉnh cũ đã nhập vào, để quy đổi địa chỉ cũ (OSM, danh sách của Sở…) sang tỉnh mới.
 */
final class Provinces
{
    /** code => [tên, [tên tỉnh cũ đã nhập vào]] */
    private const LIST = [
        'ha-noi' => ['Hà Nội', []],
        'hue' => ['Huế', ['Thừa Thiên Huế', 'Thừa Thiên - Huế']],
        'lai-chau' => ['Lai Châu', []],
        'dien-bien' => ['Điện Biên', []],
        'son-la' => ['Sơn La', []],
        'lang-son' => ['Lạng Sơn', []],
        'quang-ninh' => ['Quảng Ninh', []],
        'thanh-hoa' => ['Thanh Hóa', ['Thanh Hoá']],
        'nghe-an' => ['Nghệ An', []],
        'ha-tinh' => ['Hà Tĩnh', []],
        'cao-bang' => ['Cao Bằng', []],
        'tuyen-quang' => ['Tuyên Quang', ['Hà Giang']],
        'lao-cai' => ['Lào Cai', ['Yên Bái']],
        'thai-nguyen' => ['Thái Nguyên', ['Bắc Kạn', 'Bắc Cạn']],
        'phu-tho' => ['Phú Thọ', ['Vĩnh Phúc', 'Hòa Bình', 'Hoà Bình']],
        'bac-ninh' => ['Bắc Ninh', ['Bắc Giang']],
        'hung-yen' => ['Hưng Yên', ['Thái Bình']],
        'hai-phong' => ['Hải Phòng', ['Hải Dương']],
        'ninh-binh' => ['Ninh Bình', ['Hà Nam', 'Nam Định']],
        'quang-tri' => ['Quảng Trị', ['Quảng Bình']],
        'da-nang' => ['Đà Nẵng', ['Quảng Nam']],
        'quang-ngai' => ['Quảng Ngãi', ['Kon Tum']],
        'gia-lai' => ['Gia Lai', ['Bình Định']],
        'khanh-hoa' => ['Khánh Hòa', ['Khánh Hoà', 'Ninh Thuận']],
        'lam-dong' => ['Lâm Đồng', ['Đắk Nông', 'Đăk Nông', 'Bình Thuận']],
        'dak-lak' => ['Đắk Lắk', ['Đăk Lăk', 'Đắc Lắc', 'Phú Yên']],
        'ho-chi-minh' => ['TP. Hồ Chí Minh', ['Hồ Chí Minh', 'TPHCM', 'TP HCM', 'Sài Gòn', 'Bình Dương', 'Bà Rịa - Vũng Tàu', 'Bà Rịa Vũng Tàu']],
        'dong-nai' => ['Đồng Nai', ['Bình Phước']],
        'tay-ninh' => ['Tây Ninh', ['Long An']],
        'can-tho' => ['Cần Thơ', ['Sóc Trăng', 'Hậu Giang']],
        'vinh-long' => ['Vĩnh Long', ['Bến Tre', 'Trà Vinh']],
        'dong-thap' => ['Đồng Tháp', ['Tiền Giang']],
        'ca-mau' => ['Cà Mau', ['Bạc Liêu']],
        'an-giang' => ['An Giang', ['Kiên Giang']],
    ];

    /**
     * @return array<string, string> code => tên
     */
    public static function options(): array
    {
        return array_map(fn (array $entry): string => $entry[0], self::LIST);
    }

    public static function name(?string $code): ?string
    {
        return $code === null ? null : (self::LIST[$code][0] ?? null);
    }

    /**
     * Tìm tỉnh (mới) trong một đoạn địa chỉ, nhận cả tên tỉnh cũ. Tên dài khớp trước
     * ("Bà Rịa - Vũng Tàu" trước "Vũng Tàu"); không thấy thì null.
     */
    public static function detect(?string $text): ?string
    {
        if ($text === null || trim($text) === '') {
            return null;
        }

        $haystack = ' '.str_replace('-', ' ', Text::normalize($text)).' ';
        $haystack = (string) preg_replace('/\b(tinh|thanh pho|tp)\b\.?/', ' ', $haystack);
        $haystack = ' '.trim((string) preg_replace('/\s+/', ' ', $haystack)).' ';

        $best = null;
        $bestLength = 0;
        foreach (self::LIST as $code => [$name, $old]) {
            foreach ([$name, ...$old] as $alias) {
                $needle = trim((string) preg_replace('/\s+/', ' ', str_replace(['-', '.'], ' ', Text::normalize($alias))));
                $needle = trim((string) preg_replace('/^(tp|thanh pho|tinh) /', '', $needle));
                if (strlen($needle) > $bestLength && str_contains($haystack, ' '.$needle.' ')) {
                    $best = $code;
                    $bestLength = strlen($needle);
                }
            }
        }

        return $best;
    }
}
