<?php

namespace Database\Seeders;

use App\Enums\BuyerKind;
use App\Enums\BuyerStatus;
use App\Enums\ReportStatus;
use App\Models\Buyer;
use App\Models\PriceReport;
use App\Models\Product;
use App\Models\User;
use Illuminate\Database\Seeder;
use RuntimeException;

/**
 * Dữ liệu demo cho "Giá quanh tôi": điểm mua đã duyệt quanh Buôn Ma Thuột (cà phê, tiêu, sầu riêng, chanh dây, phân bón),
 * Gia Lai (chanh dây) và Cần Thơ (lúa, phân bón), giá 3 ngày gần đây; 1 điểm chờ duyệt và 1 giá chờ duyệt để thử trang admin.
 *
 * Chỉ chạy trên máy dev: php artisan db:seed --class=LocalPriceDemoSeeder (chạy lại thì cập nhật, không trùng).
 * Tài khoản điểm mua: 09000001xx, mật khẩu: nhanong-demo
 */
class LocalPriceDemoSeeder extends Seeder
{
    public const PASSWORD = 'nhanong-demo';

    public function run(): void
    {
        if (! app()->environment('local', 'testing')) {
            throw new RuntimeException('Chỉ chạy dữ liệu demo trên máy dev (APP_ENV=local).');
        }

        // [sđt, tên, loại, mua/bán gì, tỉnh, lat, lng, địa chỉ, xác minh, [mã hàng => giá hôm nay]]
        $buyers = [
            ['0900000101', 'Công ty TNHH Cà phê Tây Nguyên Xanh', BuyerKind::Company, ['thu_mua'], 'dak-lak', 12.7000, 108.0300, 'KCN Hòa Phú, Buôn Ma Thuột', true,
                ['ca-phe-robusta' => 93000, 'ho-tieu' => 141000]],
            ['0900000102', 'Đại lý Hai Lúa', BuyerKind::Agent, ['thu_mua', 'phan_bon'], 'dak-lak', 12.6600, 108.0700, '123 Nguyễn Tất Thành, Buôn Ma Thuột', true,
                ['ca-phe-robusta' => 92500, 'ho-tieu' => 140000, 'ure-phu-my' => 545000, 'npk-20-20-15-binh-dien' => 845000]],
            ['0900000103', 'Thương lái Tư Hùng', BuyerKind::Trader, ['thu_mua'], 'dak-lak', 12.7500, 108.1200, 'Xã Hòa Thuận', false,
                ['ca-phe-robusta' => 93300, 'sau-rieng-ri6' => 36000, 'chanh-day-xuat-khau' => 31000, 'chanh-day-muc' => 21000]],
            ['0900000104', 'Cửa hàng vật tư nông nghiệp Ba Thành', BuyerKind::Retail, ['phan_bon', 'thuoc_bvtv'], 'dak-lak', 12.6900, 108.0000, 'Xã Hòa Thắng', false,
                ['ure-phu-my' => 560000, 'npk-20-20-15-binh-dien' => 860000]],
            ['0900000105', 'Vựa sầu riêng Bảy Lợi', BuyerKind::Trader, ['thu_mua'], 'dak-lak', 12.8000, 108.2000, 'Xã Ea Kao', true,
                ['sau-rieng-ri6' => 34500, 'sau-rieng-thai' => 78000]],
            ['0900000106', 'Nhà máy xay xát Mười Hạnh', BuyerKind::Company, ['thu_mua'], 'can-tho', 10.0700, 105.7000, 'Phường Thới An Đông, Cần Thơ', true,
                ['lua-ir-50404' => 6150, 'lua-om-18' => 6300, 'lua-dai-thom-8' => 6350]],
            ['0900000107', 'Đại lý vật tư Sáu Phước', BuyerKind::Agent, ['phan_bon'], 'can-tho', 10.0300, 105.7800, 'Phường Cái Khế, Cần Thơ', false,
                ['ure-phu-my' => 552000, 'npk-20-20-15-binh-dien' => 850000]],
            ['0900000109', 'Vựa chanh dây Ba Tâm', BuyerKind::Trader, ['thu_mua'], 'gia-lai', 14.0500, 107.9300, 'Xã Ia Ly, Chư Păh', true,
                ['chanh-day-xuat-khau' => 33000, 'chanh-day-loai-2' => 26000, 'chanh-day-muc' => 22000]],
            ['0900000110', 'Nhà máy chế biến nông sản Ia Grai', BuyerKind::Company, ['thu_mua'], 'gia-lai', 13.9900, 107.8400, 'Xã Ia Grai', true,
                ['chanh-day-xuat-khau' => 34000, 'chanh-day-muc' => 23500]],
        ];

        $products = Product::query()->pluck('id', 'code');
        $units = Product::query()->pluck('unit', 'code');

        foreach ($buyers as [$phone, $name, $kind, $dealsIn, $province, $lat, $lng, $address, $verified, $prices]) {
            $buyer = $this->buyer($phone, $name, $kind, $dealsIn, $province, $lat, $lng, $address);
            $buyer->approve($verified);

            // Giá 3 ngày gần đây (hôm nay, hôm qua, 3 hôm trước), dao động nhẹ
            foreach ([0 => 0, 1 => -0.004, 3 => 0.006] as $daysAgo => $change) {
                foreach ($prices as $code => $price) {
                    $this->report($buyer, (int) $products[$code], $units[$code], now()->subDays($daysAgo)->toDateString(), (int) round($price * (1 + $change), -2));
                }
            }
        }

        // Điểm mua chờ duyệt (thử nút Duyệt trong /admin → Giá theo khu vực)
        $this->buyer('0900000108', 'Đại lý Năm Tèo', BuyerKind::Agent, ['thu_mua'], 'dak-lak', 12.6300, 108.0600, 'Xã Cư Ê Bur');

        // Giá lạ chờ duyệt
        $tuHung = Buyer::query()->where('name', 'Thương lái Tư Hùng')->firstOrFail();
        PriceReport::query()->updateOrCreate(
            ['buyer_id' => $tuHung->id, 'product_id' => $products['ho-tieu'], 'date' => now()->subDay()->toDateString()],
            ['price' => 210000, 'unit' => 'kg', 'province_code' => 'dak-lak', 'lat' => $tuHung->lat, 'lng' => $tuHung->lng,
                'status' => ReportStatus::NeedsReview, 'reference_price' => 140000, 'review_reason' => 'Lệch 50% so với giá các điểm mua khác trong 50 km (140.000 đ)'],
        );
    }

    /**
     * @param  list<string>  $dealsIn
     */
    private function buyer(string $phone, string $name, BuyerKind $kind, array $dealsIn, string $province, float $lat, float $lng, string $address): Buyer
    {
        $user = User::query()->updateOrCreate(['phone' => $phone], ['name' => $name, 'password' => self::PASSWORD]);

        return Buyer::query()->updateOrCreate(['user_id' => $user->id], [
            'name' => $name, 'kind' => $kind, 'deals_in' => $dealsIn, 'phone' => $phone, 'address' => $address,
            'province_code' => $province, 'lat' => $lat, 'lng' => $lng, 'status' => BuyerStatus::Pending,
        ]);
    }

    private function report(Buyer $buyer, int $productId, string $unit, string $date, int $price): void
    {
        PriceReport::query()->updateOrCreate(
            ['buyer_id' => $buyer->id, 'product_id' => $productId, 'date' => $date],
            ['price' => $price, 'unit' => $unit, 'province_code' => $buyer->province_code, 'lat' => $buyer->lat, 'lng' => $buyer->lng, 'status' => ReportStatus::Published],
        );
    }
}
