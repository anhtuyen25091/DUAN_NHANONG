<?php

namespace Database\Seeders;

use App\Enums\CategoryType;
use App\Models\Category;
use App\Models\Product;
use App\Models\Region;
use Illuminate\Database\Seeder;

/**
 * Danh mục, mặt hàng và khu vực ban đầu. Chạy lại an toàn (cập nhật theo slug/code).
 * Alias là các cách báo chí hay viết; context_keywords dùng để phân biệt tên trùng (vd "OM 18" lúa và gạo).
 */
class CatalogSeeder extends Seeder
{
    private const LUA_CONTEXT = ['lúa tươi', 'giá lúa', 'lúa khô', 'lúa'];

    private const GAO_CONTEXT = ['gạo nguyên liệu', 'gạo xuất khẩu', 'gạo NL'];

    public function run(): void
    {
        $categories = [
            ['slug' => 'ca-phe', 'name' => 'Cà phê', 'type' => CategoryType::NongSan],
            ['slug' => 'ho-tieu', 'name' => 'Hồ tiêu', 'type' => CategoryType::NongSan],
            ['slug' => 'lua', 'name' => 'Lúa', 'type' => CategoryType::NongSan],
            ['slug' => 'gao', 'name' => 'Gạo nguyên liệu', 'type' => CategoryType::NongSan],
            ['slug' => 'phan-bon', 'name' => 'Phân bón (giá bao)', 'type' => CategoryType::PhanBon],
            ['slug' => 'phan-bon-si', 'name' => 'Phân bón giá sỉ (theo kg)', 'type' => CategoryType::PhanBon],
            ['slug' => 'thuoc-bvtv', 'name' => 'Thuốc bảo vệ thực vật', 'type' => CategoryType::ThuocBvtv],
            ['slug' => 'sau-rieng', 'name' => 'Sầu riêng', 'type' => CategoryType::NongSan],
            ['slug' => 'chanh-day', 'name' => 'Chanh dây (chanh leo)', 'type' => CategoryType::NongSan],
        ];

        foreach ($categories as $sort => $category) {
            Category::query()->updateOrCreate(['slug' => $category['slug']], [...$category, 'sort' => $sort]);
        }

        $products = [
            ['ca-phe', 'ca-phe-robusta', 'Cà phê nhân xô (Robusta)', 'kg', ['cà phê nhân xô', 'cà phê']],
            ['ho-tieu', 'ho-tieu', 'Hồ tiêu đen', 'kg', ['hồ tiêu']],

            ['lua', 'lua-ds1', 'Lúa DS1 (tươi)', 'kg', ['DS1'], self::LUA_CONTEXT],
            ['lua', 'lua-om-18', 'Lúa OM 18 (tươi)', 'kg', ['OM 18'], self::LUA_CONTEXT],
            ['lua', 'lua-dai-thom-8', 'Lúa Đài Thơm 8 (tươi)', 'kg', ['Đài Thơm 8'], self::LUA_CONTEXT],
            ['lua', 'lua-ir-50404', 'Lúa IR 50404 (tươi)', 'kg', ['IR 50404', 'Lúa IR 50404 - lúa tươi', 'IR 504', 'IR504'], self::LUA_CONTEXT],
            ['lua', 'lua-om-5451', 'Lúa OM 5451 (tươi)', 'kg', ['OM 5451', 'Lúa OM 5451 tươi'], self::LUA_CONTEXT],
            ['lua', 'lua-om-34', 'Lúa OM 34 (tươi)', 'kg', ['OM 34'], self::LUA_CONTEXT],
            ['lua', 'lua-om-380', 'Lúa OM 380 (tươi)', 'kg', ['OM 380'], self::LUA_CONTEXT],

            ['gao', 'gao-cl-555', 'Gạo nguyên liệu CL 555', 'kg', ['CL 555'], self::GAO_CONTEXT],
            ['gao', 'gao-ir-504', 'Gạo nguyên liệu IR 504', 'kg', ['IR 504', 'IR504'], self::GAO_CONTEXT],
            ['gao', 'gao-om-18', 'Gạo nguyên liệu OM 18', 'kg', ['OM 18'], self::GAO_CONTEXT],
            ['gao', 'gao-om-5451', 'Gạo nguyên liệu OM 5451', 'kg', ['OM 5451'], self::GAO_CONTEXT],
            ['gao', 'gao-dai-thom-8', 'Gạo nguyên liệu Đài Thơm 8', 'kg', ['Đài Thơm 8'], self::GAO_CONTEXT],
            ['gao', 'gao-om-380', 'Gạo nguyên liệu OM 380', 'kg', ['OM 380'], self::GAO_CONTEXT],

            ['phan-bon', 'ure-ca-mau', 'Urê Cà Mau', 'bao', ['Đạm Cà Mau']],
            // "Phân đạm Urê Phú mỹ": tên trong CSDL giá agro.gov.vn (giá An Giang theo kg, quy ra bao 50 kg)
            ['phan-bon', 'ure-phu-my', 'Urê Phú Mỹ', 'bao', ['Đạm Phú Mỹ', 'Phân đạm Urê Phú mỹ']],
            ['phan-bon', 'dap-nga', 'DAP Nga', 'bao', []],
            ['phan-bon', 'dap-han-quoc', 'DAP Hàn Quốc', 'bao', []],
            ['phan-bon', 'dap-dinh-vu', 'DAP Đình Vũ', 'bao', []],
            ['phan-bon', 'npk-20-20-15-binh-dien', 'NPK 20-20-15 Bình Điền', 'bao', ['NPK Đầu trâu (20-20-15)']],
            ['phan-bon', 'npk-16-16-8-dau-trau', 'NPK 16-16-8 Đầu Trâu', 'bao', []],
            ['phan-bon', 'npk-18-8-18-ca-mau', 'NPK 18-8-18 Cà Mau', 'bao', []],
            ['phan-bon', 'npk-16-16-8-ca-mau', 'NPK 16-16-8 Cà Mau', 'bao', []],
            ['phan-bon', 'npk-16-16-8-phu-my', 'NPK 16-16-8 Phú Mỹ', 'bao', []],
            ['phan-bon', 'kali-bot-ca-mau', 'Kali bột Cà Mau', 'bao', []],
            ['phan-bon', 'kali-bot-phu-my', 'Kali bột Phú Mỹ', 'bao', []],
            ['phan-bon', 'lan-van-dien', 'Lân Văn Điển', 'bao', []],
            ['phan-bon', 'lan-lam-thao', 'Lân Lâm Thao', 'bao', []],

            ['phan-bon-si', 'si-ure-duc-malaysia', 'Urê đục Malaysia', 'kg', ['Urea Đục Malaysia']],
            ['phan-bon-si', 'si-ure-ninh-binh', 'Urê Ninh Bình', 'kg', ['Urea Ninh Bình']],
            ['phan-bon-si', 'si-dap-nga-64', 'DAP Nga đen 64%', 'kg', []],
            ['phan-bon-si', 'si-dap-humic-tq-64', 'DAP Humic Trung Quốc đen 64%', 'kg', []],
            ['phan-bon-si', 'si-kali-nga-bot-do', 'Kali Nga bột đỏ', 'kg', []],
            ['phan-bon-si', 'si-kali-nga-hat-mieng', 'Kali Nga hạt miểng', 'kg', []],
            ['phan-bon-si', 'si-kali-israel-hat-mieng', 'Kali Israel hạt miểng', 'kg', []],
            ['phan-bon-si', 'si-kali-jordan-bot-trang', 'Kali Jordan bột trắng', 'kg', []],
            ['phan-bon-si', 'si-kali-jordan-mieng', 'Kali Jordan miểng', 'kg', []],
            ['phan-bon-si', 'si-sa-nhat-bot-vang', 'SA Nhật bột vàng', 'kg', []],

            // Sầu riêng: chỉ lưu giá loại A (báo gọi "loại A" hoặc "loại 1", agro.gov.vn gọi "Ri6 đẹp") là mức hay được
            // báo giá nhất; bỏ VIP, loại B/C, hàng dạt/lỗi/kem (xem App\Crawling\Adapters\DurianArticleAdapter)
            ['sau-rieng', 'sau-rieng-ri6', 'Sầu riêng Ri6 (loại A)', 'kg', ['Ri6', 'Ri 6', 'sầu riêng Ri6', 'Sầu riêng Ri6 đẹp']],
            ['sau-rieng', 'sau-rieng-thai', 'Sầu riêng Thái - Monthong (loại A)', 'kg', ['Thái', 'sầu Thái', 'sầu riêng Thái', 'Monthong', 'Mon Thong']],

            // Chanh dây: chưa có nguồn đăng giá hằng ngày để crawl; giá do điểm mua đăng (Giá theo khu vực) và admin nhập tay.
            // Chia theo loại thương lái / nhà máy thu mua: quả to đẹp đi xuất khẩu, quả vừa, quả nhỏ/xấu bán múc ruột cho nhà máy.
            ['chanh-day', 'chanh-day-xuat-khau', 'Chanh dây loại xuất khẩu (loại 1)', 'kg', ['chanh dây xuất khẩu', 'chanh leo xuất khẩu', 'chanh dây loại 1', 'chanh leo loại 1']],
            ['chanh-day', 'chanh-day-loai-2', 'Chanh dây loại 2', 'kg', ['chanh dây loại 2', 'chanh leo loại 2']],
            ['chanh-day', 'chanh-day-muc', 'Chanh dây múc / xô', 'kg', ['chanh dây múc', 'chanh leo múc', 'chanh dây xô', 'chanh leo xô', 'chanh múc']],
        ];

        $categoryIds = Category::query()->pluck('id', 'slug');
        foreach ($products as $sort => $product) {
            [$category, $code, $name, $unit, $aliases] = $product;
            Product::query()->updateOrCreate(['code' => $code], [
                'category_id' => $categoryIds[$category],
                'name' => $name,
                'unit' => $unit,
                'aliases' => $aliases,
                'context_keywords' => $product[5] ?? null,
                'sort' => $sort,
            ]);
        }

        $regions = [
            ['toan-quoc', 'Toàn quốc', null, []],
            ['tay-nguyen', 'Tây Nguyên', null, []],
            ['dong-nam-bo', 'Đông Nam Bộ', null, ['miền Đông']],
            ['dak-lak', 'Đắk Lắk', 'Đắk Lắk', ['Đăk Lăk', 'Đắc Lắc']],
            ['gia-lai', 'Gia Lai', 'Gia Lai', []],
            ['lam-dong', 'Lâm Đồng', 'Lâm Đồng', []],
            ['dak-nong', 'Đắk Nông (cũ)', 'Lâm Đồng', ['Đắk Nông', 'Đăk Nông', 'Lâm Đồng (Đắk Nông cũ)']],
            ['binh-phuoc', 'Bình Phước (cũ)', 'Đồng Nai', ['Bình Phước']],
            ['dong-nai', 'Đồng Nai', 'Đồng Nai', []],
            ['ba-ria-vung-tau', 'Bà Rịa - Vũng Tàu (cũ)', 'TP. Hồ Chí Minh', ['Bà Rịa Vũng Tàu']],
            ['an-giang', 'An Giang', 'An Giang', []],
            ['dbscl', 'Đồng bằng sông Cửu Long', null, ['ĐBSCL', 'miền Tây', 'Miền Tây Nam Bộ', 'Tây Nam Bộ']],
            ['tp-hcm', 'TP. Hồ Chí Minh', 'TP. Hồ Chí Minh', ['TP.HCM', 'HCM', 'Sài Gòn']],
            ['ha-noi', 'Hà Nội', 'Hà Nội', ['HN']],
            ['quy-nhon', 'Quy Nhơn', 'Gia Lai', []],
            ['son-la', 'Sơn La', 'Sơn La', []],
        ];

        foreach ($regions as $sort => [$code, $name, $province, $aliases]) {
            Region::query()->updateOrCreate(['code' => $code], [
                'name' => $name,
                'province' => $province,
                'aliases' => $aliases,
                'sort' => $sort,
            ]);
        }
    }
}
