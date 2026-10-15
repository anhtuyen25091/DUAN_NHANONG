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
                'section' => ['start' => '/^gia ca phe/', 'stop' => '/^gia (ho )?tieu|^thong tin/'],
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
                'section' => ['start' => '/^gia (ho )?tieu/', 'stop' => '/^gia ca phe|^thong tin/'],
                'backfill' => ['sitemaps' => $baoquocteSitemaps, 'url_pattern' => '#baoquocte\.vn/(gia-tieu-hom-nay|gia-nong-san-hom-nay)-#'],
            ],
        ];

        foreach ($sources as $source) {
            PriceSource::query()->updateOrCreate(['code' => $source['code']], ['adapter' => 'sitemap_article', ...$source]);
        }
    }
}
