<?php

return [

    /*
    | Xem lịch sử giá được bao nhiêu ngày gần nhất, theo loại tài khoản.
    | Tài khoản có gói (users.premium_until còn hạn) xem toàn bộ.
    */
    'price_history' => [
        'guest_days' => (int) env('PRICE_HISTORY_GUEST_DAYS', 10),
        'member_days' => (int) env('PRICE_HISTORY_MEMBER_DAYS', 30),
        // Giới hạn kỹ thuật cho 1 lần gọi (kể cả tài khoản có gói)
        'max_days' => 3660,
    ],

    /*
    | Tìm địa danh (xã / phường / thôn / huyện cũ) để lấy tọa độ "Khu vực của tôi".
    | Mặc định dùng Photon (dữ liệu OpenStreetMap, miễn phí, không cần khóa); tự chạy Photon riêng thì đổi GEOCODER_URL.
    */
    'geocoder' => [
        'url' => env('GEOCODER_URL', 'https://photon.komoot.io/api/'),
        // Tra ngược tọa độ → địa danh (điền tỉnh cho điểm bán không ghi tỉnh)
        'reverse_url' => env('GEOCODER_REVERSE_URL', 'https://photon.komoot.io/reverse'),
        'cache_days' => 30,
    ],

];
