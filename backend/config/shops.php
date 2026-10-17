<?php

use App\Shops\Collect\Sources\LicenseDocxSource;
use App\Shops\Collect\Sources\LicenseHtmlSource;
use App\Shops\Collect\Sources\LicenseSheetSource;
use App\Shops\Collect\Sources\OsmSource;

return [

    /*
    | Nguồn thu thập điểm bán: khóa => class (App\Shops\Collect\ShopSource).
    | Chạy: php artisan shops:collect [khóa...]
    */
    'sources' => [
        'osm' => OsmSource::class,

        // Hà Tĩnh: danh sách cơ sở được cấp giấy đủ điều kiện buôn bán (đến tháng 5/2025), Sở NN&MT đăng 02/06/2025
        'so-ha-tinh-pb' => [
            'class' => LicenseSheetSource::class,
            'label' => 'Sở NN&MT Hà Tĩnh: buôn bán phân bón',
            'url' => 'https://sonnmt.hatinh.gov.vn/sotnmt/static/uploads/ckeditor/plugin_ckeditor_upload.upload.a055868afe483e66.5048414e424f4e2e786c7378.xlsx',
            'page' => 'https://sonnmt.hatinh.gov.vn/sotnmt/portal/read/tuyen-truyen-phap-luat/news/danh-sach-cac-co-so-kinh-doanh-giong-phan-bon-thuoc-bao-ve-thuc-vat-thuoc-thu-y-.html',
            'province' => 'ha-tinh',
            'types' => ['phan_bon'],
            'trust' => 85,
        ],
        'so-ha-tinh-bvtv' => [
            'class' => LicenseSheetSource::class,
            'label' => 'Sở NN&MT Hà Tĩnh: buôn bán thuốc BVTV',
            'url' => 'https://sonnmt.hatinh.gov.vn/sotnmt/static/uploads/ckeditor/plugin_ckeditor_upload.upload.920be682be6ef277.425654562e786c7378.xlsx',
            'page' => 'https://sonnmt.hatinh.gov.vn/sotnmt/portal/read/tuyen-truyen-phap-luat/news/danh-sach-cac-co-so-kinh-doanh-giong-phan-bon-thuoc-bao-ve-thuc-vat-thuoc-thu-y-.html',
            'province' => 'ha-tinh',
            'types' => ['thuoc_bvtv'],
            'trust' => 85,
        ],

        // Sơn La: cổng dữ liệu mở (bảng HTML chia trang, 10 dòng / trang)
        'so-son-la-pb' => [
            'class' => LicenseHtmlSource::class,
            'label' => 'Sở NN&MT Sơn La: buôn bán phân bón (cổng dữ liệu mở)',
            'url' => 'https://data.sonla.gov.vn/detail_data/co-so-duoc-cap-giay-chung-nhan-du-dieu-kien-buon-ban-phan-bon?page={page}',
            'province' => 'son-la',
            'types' => ['phan_bon'],
            'trust' => 85,
        ],
        'so-son-la-bvtv' => [
            'class' => LicenseHtmlSource::class,
            'label' => 'Sở NN&MT Sơn La: buôn bán thuốc BVTV, đến 27/5/2024 (cổng dữ liệu mở)',
            'url' => 'https://data.sonla.gov.vn/detail_data/danh-sach-co-so-duoc-cap-giay-chung-nhan-du-dieu-kien-buon-ban-thuoc-bao-ve-thuc-vat-tren-dia-ban-tinh-son-la-den-ngay-2752024?page={page}',
            'province' => 'son-la',
            'types' => ['thuoc_bvtv'],
            'trust' => 85,
        ],

        // Thanh Hóa: cổng dữ liệu mở, file Word (Chi cục TT&BVTV, ngày 23/8/2024)
        'so-thanh-hoa-bvtv' => [
            'class' => LicenseDocxSource::class,
            'label' => 'Sở NN&MT Thanh Hóa: đại lý buôn bán thuốc BVTV (cổng dữ liệu mở)',
            'url' => 'https://opendata.thanhhoa.gov.vn/dataset/e91631ee-5cc3-45c4-a3c7-c56ff5e73aca/resource/220894fb-6d42-4c94-8fd8-8a33a4a47cea/download/i-ly-buon-ban-thuc-bvtv-tnh-thanh-hoa.docx',
            'page' => 'https://opendata.thanhhoa.gov.vn/dataset/du-lieu-ve-co-so-buon-ban-thuoc-bao-ve-thuc-vat',
            'province' => 'thanh-hoa',
            'types' => ['thuoc_bvtv'],
            'trust' => 85,
        ],
    ],

    /*
    | Điểm tin cậy (0–100) từ mức này trở lên thì tự đưa vào danh sách điểm bán; thấp hơn thì chờ admin duyệt.
    | Điểm = độ tin cậy của nguồn + có số điện thoại (5) + tọa độ đúng nhà (10) / đúng xã (5) + có ở nguồn khác (20).
    */
    'publish_threshold' => (int) env('SHOPS_PUBLISH_THRESHOLD', 70),

    /*
    | Nghỉ giữa 2 lần tra tọa độ (mili giây): dịch vụ Photon miễn phí, không gọi dồn dập.
    */
    'geocode_delay_ms' => (int) env('SHOPS_GEOCODE_DELAY_MS', 1100),

];
