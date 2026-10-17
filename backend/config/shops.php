<?php

use App\Shops\Collect\Sources\OsmSource;

return [

    /*
    | Nguồn thu thập điểm bán: khóa => class (App\Shops\Collect\ShopSource).
    | Chạy: php artisan shops:collect [khóa...]
    */
    'sources' => [
        'osm' => OsmSource::class,
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
