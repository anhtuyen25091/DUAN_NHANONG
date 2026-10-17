<?php

namespace App\Shops\Collect\Sources;

use App\Crawling\Extraction\Text;
use App\Enums\ShopType;
use App\Shops\Collect\CandidateData;

/**
 * Đọc bảng "danh sách cơ sở được cấp giấy đủ điều kiện buôn bán" của các Sở (Excel hoặc bảng HTML):
 * tìm dòng tiêu đề theo tên cột, ghép địa chỉ từ các cột thôn / xã / huyện, tạo CandidateData cho từng dòng.
 */
final class LicenseTable
{
    /** Tên cột (không dấu, chữ đầu của ô tiêu đề) → trường */
    private const COLUMNS = [
        'name' => ['ten co so', 'ten to chuc', 'ho va ten', 'ten chu', 'ten doanh nghiep', 'ten cua hang'],
        'owner' => ['chu co so', 'nguoi dai dien'],
        'address' => ['dia chi'],
        'hamlet' => ['thon', 'ban', 'to dan pho', 'ap'],
        'commune' => ['xa', 'phuong'],
        'district' => ['huyen', 'quan', 'thi xa'],
        'phone' => ['dien thoai', 'so dien thoai', 'sdt', 'dt'],
        'certificate' => ['so giay', 'so gcn'],
        'issued' => ['ngay cap'],
    ];

    /**
     * Vị trí các cột nếu dòng này là dòng tiêu đề (có cột tên và địa chỉ / xã), không thì null.
     *
     * @param  list<string>  $cells
     * @return array<string, int>|null
     */
    public static function header(array $cells): ?array
    {
        $columns = [];
        foreach ($cells as $i => $cell) {
            $text = Text::normalize($cell);
            foreach (self::COLUMNS as $field => $words) {
                if (isset($columns[$field])) {
                    continue;
                }
                foreach ($words as $word) {
                    // So đầu ô ("Bản" khác "Số giấy chứng nhận buôn bán")
                    if ($text === $word || str_starts_with($text, $word.' ') || str_starts_with($text, $word.'/')) {
                        $columns[$field] = $i;
                        break 2;
                    }
                }
            }
        }

        return isset($columns['name']) && (isset($columns['address']) || isset($columns['commune'])) ? $columns : null;
    }

    /**
     * @param  list<string>  $cells
     * @param  array<string, int>  $columns
     * @param  list<ShopType>  $types
     */
    public static function candidate(array $cells, array $columns, ?string $district, string $province, array $types, ?string $url, string $refPrefix): ?CandidateData
    {
        $get = fn (string $field): string => isset($columns[$field]) ? trim((string) preg_replace('/\s+/u', ' ', $cells[$columns[$field]] ?? '')) : '';

        $name = $get('name');
        // Dòng trống / dòng chân trang ("Người lập biểu"…) / tên quá dài (gộp ô)
        if ($name === '' || mb_strlen($name) > 120 || preg_match('/^(người lập|thủ trưởng|giám đốc|tổng|ghi chú)/iu', $name) === 1) {
            return null;
        }

        $address = $get('address');
        if ($address === '') {
            $address = implode(', ', array_filter([
                $get('hamlet'),
                self::withPrefix($get('commune'), 'xã', '/^(xã|phường|thị trấn|tt\.?|p\.)\s/iu'),
                self::withPrefix($get('district'), 'huyện', '/^(huyện|thị xã|thành phố|tp\.?|tx\.?|quận)\s/iu'),
            ]));
        }
        if ($address === '') {
            return null;
        }
        // "Thôn Nam Bình - xã Thạch Đài" → dấu phẩy; thêm huyện (tên trang tính / tiêu đề) nếu địa chỉ chưa có
        $address = (string) preg_replace('/\s+[-–]\s+/u', ', ', $address);
        if ($district !== null && ! str_contains(Text::normalize($address), Text::normalize($district))) {
            $address .= ", {$district}";
        }

        $certificate = $get('certificate');

        return new CandidateData(
            // Số giấy chỉ duy nhất trong 1 huyện / 1 năm và nguồn có khi ghi trùng số: ghép tiền tố + số + tên
            ref: $refPrefix.'#'.$certificate.'#'.substr(md5(Text::normalize($name)), 0, 8),
            name: $name,
            address: $address,
            province: $province,
            phone: $get('phone') ?: null,
            types: $types,
            url: $url,
            raw: array_filter([
                'ten' => $name, 'chu_co_so' => $get('owner'), 'dia_chi' => $address, 'huyen_cu' => $district,
                'so_gcn' => $certificate, 'ngay_cap' => $get('issued'), 'dien_thoai' => $get('phone'),
            ]),
        );
    }

    /** "Tông Lạnh" → "xã Tông Lạnh"; "TT Nông Trường" giữ nguyên */
    private static function withPrefix(string $value, string $prefix, string $hasPrefix): string
    {
        if ($value === '') {
            return '';
        }

        return preg_match($hasPrefix, $value.' ') === 1 ? $value : "{$prefix} {$value}";
    }
}
