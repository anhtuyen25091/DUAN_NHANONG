<?php

namespace App\Shops\Collect\Sources;

use App\Crawling\Extraction\Text;
use App\Enums\ShopType;
use App\Shops\Collect\CandidateData;
use App\Shops\Collect\ShopNormalizer;

/**
 * Đọc bảng "danh sách cơ sở được cấp giấy đủ điều kiện buôn bán" của các Sở (Excel hoặc bảng HTML):
 * tìm dòng tiêu đề theo tên cột, ghép địa chỉ từ các cột thôn / xã / huyện, tạo CandidateData cho từng dòng.
 */
final class LicenseTable
{
    /** Tên cột (không dấu, chữ đầu của ô tiêu đề) → trường */
    private const COLUMNS = [
        'name' => ['ten co so', 'ten to chuc', 'ho va ten', 'ten doanh nghiep', 'ten cua hang', 'ten diem', 'ten chu'],
        'owner' => ['chu co so', 'ten chu co so', 'nguoi dai dien', 'ten nguoi dai dien', 'thong tin chu co so'],
        'goods' => ['loai nong san', 'mat hang', 'nong san thu mua'],
        'coords' => ['toa do'],
        'address' => ['dia chi'],
        'hamlet' => ['thon', 'ban', 'to dan pho', 'ap'],
        'commune' => ['xa', 'phuong'],
        'district' => ['huyen', 'quan', 'thi xa'],
        'phone' => ['dien thoai', 'so dien thoai', 'sdt', 'dt'],
        'certificate' => ['so giay', 'so gcn', 'giay chung nhan'],
        'issued' => ['ngay cap'],
    ];

    /** Ô này có phải tên cột không ("Tên cơ sở", "Bản", "Huyện/Quận", "Ghi chú"…): để nhận dòng tiêu đề trong file PDF */
    public static function isHeaderWord(string $cell): bool
    {
        $text = self::headerText($cell);
        foreach ([...array_merge(...array_values(self::COLUMNS)), 'stt', 'tt', 'so tt', 'tinh', 'ghi chu', 'chu ho', 'ma so'] as $word) {
            if ($text === $word || str_starts_with($text, $word.' ') || str_starts_with($text, $word.'/')) {
                return true;
            }
        }

        return false;
    }

    /** Tên cột không dấu; tên kiểu "tenCoSo", "diaChi" (dữ liệu xuất từ phần mềm) tách thành "ten co so", "dia chi" */
    private static function headerText(string $cell): string
    {
        return Text::normalize((string) preg_replace('/(?<=\p{Ll})(?=\p{Lu})/u', ' ', $cell));
    }

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
            $text = self::headerText($cell);
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
    public static function candidate(array $cells, array $columns, ?string $district, ?string $province, array $types, ?string $url, string $refPrefix): ?CandidateData
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
                self::withPrefix($get('commune'), 'xã', '/^(xã|phường|thị trấn|tt\.|tt|p\.|x\.)\s?/iu'),
                self::withPrefix($get('district'), 'huyện', '/^(huyện|thị xã|thành phố|tp\.|tp|tx\.|tx|quận|q\.|h\.)\s?/iu'),
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
        // Tên chỉ là chữ chung ("Cửa hàng buôn bán thuốc bảo vệ thực vật"): ghép tên chủ cho dễ nhận
        $owner = $get('owner');
        if ($owner !== '' && ShopNormalizer::isGeneric($name)) {
            $name = "{$name} {$owner}";
        }
        // Tọa độ "20.070353, 105.609434" (chỉ nhận trong Việt Nam)
        $lat = $lng = null;
        if (preg_match('/(-?\d{1,2}\.\d+)\s*[,;]\s*(-?\d{2,3}\.\d+)/', $get('coords'), $m) === 1 && (float) $m[1] >= 6 && (float) $m[1] <= 24 && (float) $m[2] >= 101 && (float) $m[2] <= 118) {
            [$lat, $lng] = [(float) $m[1], (float) $m[2]];
        }

        return new CandidateData(
            // Số giấy chỉ duy nhất trong 1 huyện / 1 năm và nguồn có khi ghi trùng số: ghép tiền tố + số + tên.
            // Không có số giấy thì ghép thêm địa chỉ (người trùng tên ở nơi khác là điểm khác)
            ref: $refPrefix.'#'.$certificate.'#'.substr(md5(Text::normalize($certificate !== '' ? $name : $name.'|'.$address)), 0, 8),
            name: $name,
            address: $address,
            province: $province,
            phone: $get('phone') ?: null,
            types: $types,
            goods: $get('goods') ?: null,
            lat: $lat,
            lng: $lng,
            url: $url,
            raw: array_filter([
                'ten' => $name, 'chu_co_so' => $owner, 'dia_chi' => $address, 'huyen_cu' => $district, 'mat_hang' => $get('goods'),
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

        // Đã có chữ "xã / huyện…", hoặc ô thực ra ghi số nhà / đường / khu ("182 Bà Triệu", "KCN Tây Bắc Ga"): giữ nguyên
        if (preg_match($hasPrefix, $value.' ') === 1 || preg_match('/\d|^(số|đường|phố|kcn|khu|cụm|thôn|xóm|tổ|ngõ|km|ql|tl|chợ|ngã)\b/iu', $value) === 1) {
            return $value;
        }

        return "{$prefix} {$value}";
    }

    /**
     * Các dòng của 1 bảng (dòng tiêu đề nằm đâu đó phía trên) → các điểm bán.
     *
     * @param  list<list<string>>  $rows
     * @param  list<ShopType>  $types
     * @return iterable<CandidateData>
     */
    public static function candidates(array $rows, ?string $province, array $types, ?string $url, string $refPrefix = 'r', ?string $district = null): iterable
    {
        $columns = null;
        $header = null;
        foreach ($rows as $cells) {
            if ($columns === null) {
                $columns = self::header($cells);
                $header = $columns === null ? null : $cells;

                continue;
            }
            // Tiêu đề 2 tầng: dòng ngay sau tiêu đề là "Xã | Huyện | Tỉnh" (con của ô "Địa chỉ"): gộp lại rồi tìm cột lại
            if ($header !== null) {
                $merged = self::mergeSubHeader($header, $cells);
                $header = null;
                if ($merged !== null) {
                    $columns = self::header($merged) ?? $columns;

                    continue;
                }
            }
            $candidate = self::candidate($cells, $columns, $district, $province, $types, $url, $refPrefix);
            if ($candidate !== null) {
                yield $candidate;
            }
        }
    }

    /**
     * Dòng $sub là tầng dưới của tiêu đề (có ≥ 2 ô là tên cột, ô đầu không phải số thứ tự): trả tiêu đề đã gộp, không thì null.
     * Ô trống ở tầng dưới lấy ô tầng trên; tầng trên có ô gộp ngang (ít ô hơn) thì các ô sau ô gộp lệch sang phải.
     *
     * @param  list<string>  $parent
     * @param  list<string>  $sub
     * @return list<string>|null
     */
    private static function mergeSubHeader(array $parent, array $sub): ?array
    {
        $words = count(array_filter($sub, fn (string $cell): bool => trim($cell) !== '' && self::isHeaderWord($cell)));
        if ($words < 2 || preg_match('/^\d+$/', trim($sub[0] ?? '')) === 1) {
            return null;
        }
        $shift = max(0, count($sub) - count($parent));
        $firstSub = array_key_first(array_filter($sub, fn (string $cell): bool => trim($cell) !== '')) ?? 0;
        $merged = [];
        foreach ($sub as $i => $cell) {
            $merged[] = trim($cell) !== '' ? $cell : ($parent[$i < $firstSub ? $i : $i - $shift] ?? '');
        }

        return $merged;
    }
}
