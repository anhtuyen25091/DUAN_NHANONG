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

];
