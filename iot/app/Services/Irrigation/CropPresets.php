<?php

namespace App\Services\Irrigation;

/**
 * Gợi ý theo cây trồng, lấy từ tài liệu kỹ thuật chính thức (ghi nguồn). Chỉ để tham khảo: người dùng xem lại và chỉnh theo
 * vườn, theo kết quả phân tích đất / khuyến cáo của cán bộ kỹ thuật địa phương.
 *
 * Lưu ý số liệu:
 * - pH trong tài liệu là pHKCl; cảm biến pH đất (đo trong đất ẩm) thường cao hơn pHKCl khoảng 0,5 - 1.
 * - Độ ẩm đất trong tài liệu tính theo % sức chứa ẩm đồng ruộng (βđr), khác đơn vị % thể tích của cảm biến nên không đặt sẵn.
 * - Lượng nước tính theo lít/gốc (lít/trụ): số phút bơm tùy công suất bơm và số gốc, người dùng tự đặt.
 */
final class CropPresets
{
    /**
     * @return list<array{code: string, name: string, thresholds: list<array{metric: string, min: ?float, max: ?float, note: string}>,
     *     schedule: array{every_days: int, months: list<int>, note: string}|null, interlock: array{metric: string, max: float, note: string}|null,
     *     notes: list<string>, sources: list<array{title: string, url: string}>}>
     */
    public static function all(): array
    {
        return [
            [
                'code' => 'ca-phe-voi',
                'name' => 'Cà phê vối (kinh doanh)',
                'thresholds' => [
                    ['metric' => 'soil_ph', 'min' => 4.0, 'max' => 6.0, 'note' => 'pHKCl 4,0 - 6,0 (Khuyến nông QG). Cảm biến thường đo cao hơn 0,5 - 1: chỉnh theo kết quả phân tích đất.'],
                ],
                'schedule' => [
                    'every_days' => 20,
                    'months' => [12, 1, 2, 3, 4],
                    'note' => 'Tưới gốc chu kỳ 20 - 25 ngày mùa khô. Bung hoa (giữa T2 - đầu T3): 250 rồi 150 lít/gốc, cách 15 - 20 ngày. Số phút bơm tùy công suất bơm.',
                ],
                'interlock' => null,
                'notes' => [
                    'Trước bung hoa cà phê cần giai đoạn khô hạn nhẹ (độ ẩm đất 60 - 65% sức chứa ẩm đồng ruộng): không tưới sớm.',
                ],
                'sources' => [
                    ['title' => 'Kỹ thuật sản xuất cà phê vối bền vững và tái canh (Trung tâm Khuyến nông Quốc gia, 2018)', 'url' => 'https://www.globalcoffeeplatform.org/wp-content/uploads/2020/09/Vietnam-NSC.pdf'],
                ],
            ],
            [
                'code' => 'ho-tieu',
                'name' => 'Hồ tiêu (kinh doanh, đất bazan)',
                'thresholds' => [
                    ['metric' => 'soil_ph', 'min' => 4.5, 'max' => 6.5, 'note' => 'pHKCl 4,5 - 6,5 (Cục BVTV). Cảm biến thường đo cao hơn 0,5 - 1: chỉnh theo kết quả phân tích đất.'],
                ],
                'schedule' => [
                    'every_days' => 20,
                    'months' => [12, 1, 2, 3, 4],
                    'note' => 'Tiêu kinh doanh trên đất bazan: 100 - 120 lít/trụ, chu kỳ 20 - 25 ngày (đất cát pha: 80 - 100 lít/trụ, 10 - 15 ngày). Số phút bơm tùy công suất bơm.',
                ],
                'interlock' => null,
                'notes' => [
                    'Không để vườn tiêu úng nước, dù chỉ 24 giờ (dễ chết nhanh).',
                    'Giai đoạn phân hóa mầm hoa cần xiết nước (tạm tắt lịch tưới).',
                ],
                'sources' => [
                    ['title' => 'Hướng dẫn kỹ thuật sản xuất hồ tiêu bền vững - tài liệu TOT (Cục Bảo vệ thực vật)', 'url' => 'https://www.ppd.gov.vn/FileUpload/Documents/BVTV/Sach%20SX%20Ho%20Tieu%20TOT.pdf'],
                ],
            ],
            [
                'code' => 'sau-rieng',
                'name' => 'Sầu riêng',
                'thresholds' => [
                    ['metric' => 'soil_ph', 'min' => 5.5, 'max' => 6.5, 'note' => 'pH đất 5,5 - 6,5 (quy trình kỹ thuật Tiền Giang).'],
                ],
                'schedule' => null,
                'interlock' => [
                    'metric' => 'salinity',
                    'max' => 0.3,
                    'note' => 'Sầu riêng mẫn cảm với mặn: nước tưới phải có độ mặn < 0,3‰. Gắn cảm biến đo độ mặn nguồn nước (kênh, ao chứa) làm khóa an toàn cho máy bơm.',
                ],
                'notes' => [
                    'Đất phải thoát nước tốt, không ngập úng; tầng canh tác sâu từ 1 m.',
                ],
                'sources' => [
                    ['title' => 'Quy trình kỹ thuật kèm QĐ 34/2025/QĐ-UBND (Tiền Giang)', 'url' => 'https://vbpl.vn/TW/Lists/vbpq/Attachments/178210/QUY%20TRINH%20KEM%20QĐ%2034_2025_QĐ-UBND.doc'],
                ],
            ],
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    public static function find(string $code): ?array
    {
        return collect(self::all())->firstWhere('code', $code);
    }
}
