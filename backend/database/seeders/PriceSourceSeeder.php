<?php

namespace Database\Seeders;

use App\Models\PriceSource;
use Illuminate\Database\Seeder;

/**
 * Các nguồn giá đã khảo sát (10/2026). Cấu hình xem App\Crawling\Adapters\SitemapArticleAdapter.
 * Ghi chú: giacaphe.com cố ý che giá theo tỉnh nên không thu thập trực tiếp; vietbao trích lại số liệu của họ.
 * baohatinh có vẻ dừng chuỗi bài giá phân bón từ 05/2026 (vẫn bật, phòng khi đăng lại); Vinacam cập nhật vài tuần/lần (giá sỉ gốc).
 */
class PriceSourceSeeder extends Seeder
{
    public function run(): void
    {
        $vietbao = [
            'sitemap_url' => 'https://vietbao.vn/sitemap/sitemap-articles-day-{date}.xml',
            'content_selector' => 'div.article-content',
        ];

        $sources = [
            [
                'code' => 'vietbao-ca-phe',
                'name' => 'Vietbao - Giá cà phê (theo giacaphe.com)',
                'homepage_url' => 'https://vietbao.vn',
                'config' => [...$vietbao, 'url_pattern' => '#vietbao\.vn/gia-ca-phe-hom-nay-#', 'mode' => 'by_region', 'product_code' => 'ca-phe-robusta'],
            ],
            [
                'code' => 'vietbao-ho-tieu',
                'name' => 'Vietbao - Giá hồ tiêu',
                'homepage_url' => 'https://vietbao.vn',
                'config' => [...$vietbao, 'url_pattern' => '#vietbao\.vn/gia-ho-tieu-hom-nay-#', 'mode' => 'by_region', 'product_code' => 'ho-tieu'],
            ],
            [
                'code' => 'vietbao-lua-gao',
                'name' => 'Vietbao - Giá lúa gạo ĐBSCL (Sở NN&MT An Giang)',
                'homepage_url' => 'https://vietbao.vn',
                'config' => [...$vietbao, 'url_pattern' => '#vietbao\.vn/(gia-lua-gao-hom-nay-|ngay-\d+-gia-lua)#', 'mode' => 'by_product', 'region_code' => 'an-giang', 'categories' => ['lua', 'gao']],
            ],
            [
                'code' => 'baohatinh-phan-bon',
                'name' => 'Báo Hà Tĩnh - Giá phân bón',
                'homepage_url' => 'https://baohatinh.vn',
                'config' => [
                    'sitemap_url' => 'https://baohatinh.vn/tv/sitemaps/daily-news.xml',
                    'url_pattern' => '#baohatinh\.vn/tv/gia-phan-bon-hom-nay-#',
                    'content_selector' => 'article.entry',
                    'mode' => 'by_product',
                    'region_code' => 'toan-quoc',
                    'categories' => ['phan-bon'],
                ],
            ],
            [
                'code' => 'vinacam-phan-bon-si',
                'name' => 'Vinacam - Giá phân bón sỉ',
                'homepage_url' => 'https://vinacam.com.vn',
                'adapter' => 'page_table',
                'config' => [
                    'url' => 'https://vinacam.com.vn/bang-gia-phan-bon',
                    'table_selector' => 'table',
                    'date_selector' => 'time[datetime]',
                    'name_column' => 1,
                    'region_columns' => ['2' => 'tp-hcm', '3' => 'ha-noi', '4' => 'quy-nhon'],
                    'categories' => ['phan-bon-si'],
                    'same_day_only' => false,
                ],
            ],
        ];

        // Báo Thế giới & Việt Nam: bài giá cà phê / tiêu hằng ngày từ 2021 (từ 2025 gộp chung "Giá nông sản hôm nay").
        // Chỉ dùng để lấy dữ liệu cũ (php artisan crawl:backfill), không chạy hằng ngày.
        $baoquocte = [
            'content_selector' => 'div.__MASTERCMS_CONTENT',
            'mode' => 'by_region',
            'same_day_only' => false,
        ];
        $baoquocteSitemaps = [
            'https://baoquocte.vn/stores/lookssitemaps/site_1/sitemap-month-{Y}-{m}.xml',
            'https://baoquocte.vn/stores/lookssitemaps/site_1/sitemap-month-{Y}-{n}.xml',
        ];
        $sources[] = [
            'code' => 'baoquocte-ca-phe',
            'name' => 'Báo Thế giới & Việt Nam - Giá cà phê (dữ liệu cũ từ 2021)',
            'homepage_url' => 'https://baoquocte.vn',
            'is_enabled' => false,
            'config' => [
                ...$baoquocte,
                'product_code' => 'ca-phe-robusta',
                'price_range' => [20000, 300000],
                // Phần cà phê kéo tới tiêu đề phần tiêu ("Thông tin thị trường cà phê" vẫn thuộc phần cà phê, có bảng giá)
                'section' => ['start' => '/^gia ca phe/', 'stop' => '/^gia (ho )?tieu/'],
                'backfill' => ['sitemaps' => $baoquocteSitemaps, 'url_pattern' => '#baoquocte\.vn/(gia-ca-phe-hom-nay|gia-nong-san-hom-nay)-#'],
            ],
        ];
        $sources[] = [
            'code' => 'baoquocte-ho-tieu',
            'name' => 'Báo Thế giới & Việt Nam - Giá hồ tiêu (dữ liệu cũ từ 2021)',
            'homepage_url' => 'https://baoquocte.vn',
            'is_enabled' => false,
            'config' => [
                ...$baoquocte,
                'product_code' => 'ho-tieu',
                'price_range' => [30000, 400000],
                'section' => ['start' => '/^gia (ho )?tieu/', 'stop' => '/^gia ca phe|^thong tin thi truong (ca phe|xuat)/'],
                'backfill' => ['sitemaps' => $baoquocteSitemaps, 'url_pattern' => '#baoquocte\.vn/(gia-tieu-hom-nay|gia-nong-san-hom-nay)-#'],
            ],
        ];

        // Báo Công Thương: bản tin giá lúa gạo An Giang hằng ngày từ 2021 (cùng số liệu Sở NN An Giang như vietbao).
        // Sitemap theo tuần trong tháng: sitemap-article-2021-11-2.xml. Chỉ dùng để lấy dữ liệu cũ.
        $sources[] = [
            'code' => 'congthuong-lua-gao',
            'name' => 'Báo Công Thương - Giá lúa gạo An Giang (dữ liệu cũ từ 2021)',
            'homepage_url' => 'https://congthuong.vn',
            'is_enabled' => false,
            'config' => [
                'content_selector' => 'div.edittor-content',
                'mode' => 'by_product',
                'region_code' => 'an-giang',
                'categories' => ['lua', 'gao'],
                'price_range' => [3000, 30000],
                // Lúa tươi luôn rẻ hơn gạo nguyên liệu: bảng 2023 ghi "IR 504" ở phần lúa (= lúa IR 50404)
                'category_price_ranges' => ['lua' => [3000, 11000], 'gao' => [7000, 30000]],
                'category_min_ratio' => ['gao' => ['lua', 1.05]],
                // Mặt hàng trong danh mục là lúa tươi: bỏ giá lúa khô ("Lúa IR 50404 (khô) 6.500 đồng/kg") và phụ phẩm
                'ignore_names' => ['IR 50404 khô', 'IR 504 khô', 'IR504 khô', 'OM 5451 khô', 'OM 18 khô', 'Đài thơm 8 khô', 'OM 380 khô', 'DS1 khô', 'OM 34 khô', 'tấm OM 5451', 'tấm IR 504', 'tấm khô IR 504', 'cám khô IR 504', 'tấm thơm', 'tấm 1 IR 504', 'Gạo TP IR 504', 'gạo thành phẩm IR 504', 'IR 504 thành phẩm'],
                'same_day_only' => false,
                'backfill' => [
                    'sitemaps' => ['https://congthuong.vn/sitemap-article-{Y}-{n}-{w}.xml'],
                    'url_pattern' => '#congthuong\.vn/gia-lua-gao-hom-nay-#',
                ],
            ],
        ];

        // CSDL giá agro.gov.vn (Viện Chính sách & Chiến lược NN): giá phân bón, lúa IR 50404 / OM 5451 tươi tại An Giang theo ngày
        // 10/2021 - giữa 2024 (thưa dần tới 2025), giá sầu riêng Ri6 Tây Nguyên từ 12/2025. Giá trang tính theo kg; phân bón quy ra
        // bao 50 kg. Lúa bù chỗ Báo Công Thương ghi thiếu (2022-2023). Cà phê, tiêu… không lấy để khỏi trùng nguồn khác.
        $sources[] = [
            'code' => 'agro-gov',
            'name' => 'agro.gov.vn - CSDL giá nông sản (phân bón An Giang, sầu riêng)',
            'homepage_url' => 'https://agro.gov.vn',
            'is_enabled' => false,
            'config' => [
                'categories' => ['phan-bon', 'lua', 'sau-rieng'],
                'price_ranges' => ['phan-bon' => [4000, 40000], 'lua' => [3000, 12000], 'sau-rieng' => [15000, 300000]],
                'unit_factor' => ['phan-bon' => 50],
                'backfill' => ['strategy' => 'agro_gov'],
            ],
        ];

        // Thương hiệu & Công luận: bản tin "Giá sầu riêng hôm nay" gần như mỗi ngày từ 07/2024.
        // Lấy bài qua trang tag (sitemap ngày chỉ có 100 bài, thiếu bài giá); tag gia-ri6 phủ 10/2024 - nay,
        // 2 tag còn lại bù 07-10/2024. Hằng ngày đọc sitemap-news.xml (chỉ 50 bài mới nhất: bài đăng ~6h sáng vẫn còn lúc 8h30).
        $sources[] = [
            'code' => 'thcl-sau-rieng',
            'name' => 'Thương hiệu & Công luận - Giá sầu riêng',
            'homepage_url' => 'https://thuonghieucongluan.com.vn',
            'adapter' => 'durian_article',
            'is_enabled' => true,
            'config' => [
                'sitemap_url' => 'https://thuonghieucongluan.com.vn/sitemap-news.xml',
                'url_pattern' => '#thuonghieucongluan\.com\.vn/gia-sau-rieng-hom-nay-#',
                'content_selector' => '#content_detail',
                'categories' => ['sau-rieng'],
                'price_range' => [10000, 400000],
                'other_varieties' => ['Musang King', 'Musang', 'Chuồng Bò', 'Sáu Hữu', 'Black Thorn', 'Dona', 'Khổ qua xanh', 'Cơm vàng hạt lép'],
                'macro_regions' => [
                    'tay-nguyen' => ['dak-lak', 'gia-lai', 'lam-dong', 'dak-nong'],
                    'dong-nam-bo' => ['dong-nai', 'binh-phuoc', 'ba-ria-vung-tau', 'tp-hcm'],
                    'dbscl' => ['an-giang'],
                ],
                'backfill' => [
                    'list_pages' => [
                        ['url' => 'https://thuonghieucongluan.com.vn/news-tag254327/gia-sau-rieng/trang-{page}', 'from' => 1, 'to' => 10],
                        ['url' => 'https://thuonghieucongluan.com.vn/news-tag264505/gia-sau-rieng-hom-nay/trang-{page}', 'from' => 1, 'to' => 60],
                        ['url' => 'https://thuonghieucongluan.com.vn/news-tag267425/gia-ri6/trang-{page}', 'from' => 1, 'to' => 100],
                    ],
                    'url_pattern' => '#thuonghieucongluan\.com\.vn/gia-sau-rieng-hom-nay-#',
                ],
            ],
        ];

        foreach ($sources as $source) {
            PriceSource::query()->updateOrCreate(['code' => $source['code']], ['adapter' => 'sitemap_article', ...$source]);
        }
    }
}
