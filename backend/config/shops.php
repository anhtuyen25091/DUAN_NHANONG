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

        // Thanh Hóa: cổng dữ liệu mở (CKAN), file Word (Chi cục TT&BVTV, ngày 23/8/2024)
        'so-thanh-hoa-bvtv' => [
            'class' => LicenseDocxSource::class,
            'label' => 'Sở NN&MT Thanh Hóa: đại lý buôn bán thuốc BVTV (cổng dữ liệu mở)',
            'ckan' => ['host' => 'opendata.thanhhoa.gov.vn', 'dataset' => 'e91631ee-5cc3-45c4-a3c7-c56ff5e73aca'],
            'page' => 'https://opendata.thanhhoa.gov.vn/dataset/du-lieu-ve-co-so-buon-ban-thuoc-bao-ve-thuc-vat',
            'province' => 'thanh-hoa',
            'types' => ['thuoc_bvtv'],
            'trust' => 85,
        ],
        // Thanh Hóa, xã Tây Đô: điểm thu mua nông sản (có tọa độ, công suất)
        'xa-tay-do-thu-mua' => [
            'class' => LicenseSheetSource::class,
            'label' => 'UBND xã Tây Đô (Thanh Hóa): điểm thu mua nông sản (cổng dữ liệu mở)',
            'ckan' => ['host' => 'opendata.thanhhoa.gov.vn', 'dataset' => '87458e88-fc6d-4335-9f5b-c4e10418952a'],
            'page' => 'https://opendata.thanhhoa.gov.vn/dataset/87458e88-fc6d-4335-9f5b-c4e10418952a',
            'province' => 'thanh-hoa',
            'types' => ['thu_mua'],
            'trust' => 85,
        ],

        // Cần Thơ: cổng dữ liệu mở (CKAN), Chi cục TT&BVTV, có số điện thoại
        'so-can-tho-pb' => [
            'class' => LicenseSheetSource::class,
            'label' => 'Sở NN&MT Cần Thơ: kinh doanh phân bón (cổng dữ liệu mở)',
            'ckan' => ['host' => 'data.cantho.gov.vn', 'dataset' => '6991c963-f220-4827-ad13-dd236045bb4f'],
            'page' => 'https://data.cantho.gov.vn/dataset/6991c963-f220-4827-ad13-dd236045bb4f',
            'province' => 'can-tho',
            'types' => ['phan_bon'],
            'trust' => 85,
        ],
        'so-can-tho-bvtv' => [
            'class' => LicenseSheetSource::class,
            'label' => 'Sở NN&MT Cần Thơ: kinh doanh thuốc BVTV (cổng dữ liệu mở)',
            'ckan' => ['host' => 'data.cantho.gov.vn', 'dataset' => '1767'],
            'page' => 'https://data.cantho.gov.vn/dataset/1767',
            'province' => 'can-tho',
            'types' => ['thuoc_bvtv'],
            'trust' => 85,
        ],

        // Hải Phòng: cổng dữ liệu mở (CKAN)
        'so-hai-phong-pb' => [
            'class' => LicenseSheetSource::class,
            'label' => 'Sở NN&MT Hải Phòng: buôn bán phân bón (cổng dữ liệu mở)',
            'ckan' => ['host' => 'data.haiphong.gov.vn', 'dataset' => '09de77dc-f048-47ee-83e4-6e8e6f4a3949'],
            'page' => 'https://data.haiphong.gov.vn/dataset/09de77dc-f048-47ee-83e4-6e8e6f4a3949',
            'province' => 'hai-phong',
            'types' => ['phan_bon'],
            'trust' => 85,
        ],
        'so-hai-phong-bvtv' => [
            'class' => LicenseSheetSource::class,
            'label' => 'Sở NN&MT Hải Phòng: buôn bán thuốc BVTV (cổng dữ liệu mở)',
            'ckan' => ['host' => 'data.haiphong.gov.vn', 'dataset' => '1192ce3b-6196-4805-8e75-8da062dfa5eb'],
            'page' => 'https://data.haiphong.gov.vn/dataset/1192ce3b-6196-4805-8e75-8da062dfa5eb',
            'province' => 'hai-phong',
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
