<?php

return [
    // Header X-Webhook-Secret mà ChirpStack / The Things Stack phải gửi kèm
    'lorawan_secret' => env('IOT_LORAWAN_SECRET'),

    // Header X-Webhook-Secret mà cổng SMS phải gửi kèm
    'sms_secret' => env('IOT_SMS_SECRET'),

    'mqtt' => [
        'host' => env('IOT_MQTT_HOST', '127.0.0.1'),
        'port' => (int) env('IOT_MQTT_PORT', 1883),
        'username' => env('IOT_MQTT_USERNAME'),
        'password' => env('IOT_MQTT_PASSWORD'),
        // nhanong/{mã thiết bị}/up
        'topic' => 'nhanong/+/up',
        'client_id' => env('IOT_MQTT_CLIENT_ID', 'nhanong-iot-listener'),
    ],

    // Số dòng tối đa mỗi lần gửi (thiết bị gửi bù dữ liệu tồn theo nhiều lô)
    'max_batch' => 2000,

    // Số đo cũ hơn mức này (gửi bù khi mất mạng) chỉ lưu lại, không bắn cảnh báo
    'alert_max_age_hours' => 24,

    // Không nhận số đo cũ hơn mức này (đồng hồ thiết bị sai)
    'max_backfill_days' => 90,

    // Giữ số đo thô bao lâu; bảng gộp theo giờ giữ mãi
    'raw_retention_days' => 180,

    // Thiết bị im lặng quá lâu thì coi là mất kết nối (báo chủ trang trại 1 lần)
    'offline_after_hours' => 24,

    // Pin dưới mức này thì báo 1 lần; lên lại trên mức "hồi" (đã thay / sạc pin) thì lần sau yếu sẽ báo tiếp
    'low_battery_percent' => 20,
    'battery_recovered_percent' => 30,

    // Dự báo thời tiết theo vị trí trang trại (Open-Meteo, miễn phí, không cần khóa)
    'weather' => [
        'url' => env('IOT_WEATHER_URL', 'https://api.open-meteo.com/v1/forecast'),
        // Dữ liệu đã qua (ERA5), trễ khoảng 5 ngày; dùng cho lượng mưa cũ hơn 92 ngày
        'archive_url' => env('IOT_WEATHER_ARCHIVE_URL', 'https://archive-api.open-meteo.com/v1/archive'),
        'cache_minutes' => 60,
    ],

    // Báo "đang mưa": lượng mưa 15 phút từ mức này coi là đang mưa; tạnh đủ lâu mới coi là hết cơn
    'rain' => [
        'min_mm_15min' => 0.1,
        'dry_minutes' => 60,
        // Hai lần báo mưa của cùng trang trại cách nhau ít nhất
        'alert_cooldown_hours' => 3,
    ],

    // Xem lịch sử lượng mưa: miễn phí / có gói Nhà Nông
    'rain_history' => [
        'free_days' => 30,
        'premium_days' => 365,
    ],

    // Backend Nhà Nông: đọc gói trả phí của tài khoản đã nối (GET /api/v1/user)
    'nhanong' => [
        'api_url' => env('NHANONG_API_URL', 'http://127.0.0.1:8000'),
        // Hỏi lại backend sau ngần này (gói có thể vừa mua / hết hạn)
        'plan_cache_hours' => 6,
    ],
];
