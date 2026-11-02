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
        // Mạch điều khiển báo kết quả lệnh / trạng thái relay: nhanong/{mã thiết bị}/ack
        'ack_topic' => 'nhanong/+/ack',
        'client_id' => env('IOT_MQTT_CLIENT_ID', 'nhanong-iot-listener'),
        // Đẩy lệnh bật / tắt + cấu hình xuống nhanong/{mã thiết bị}/down cho mạch đang dùng MQTT
        // (đã gửi bản tin MQTT hợp lệ trong offline_after_hours giờ qua). Không đẩy được thì mạch vẫn lấy qua HTTP.
        'downlink' => (bool) env('IOT_MQTT_DOWNLINK', true),
        // Mã client của tiến trình đẩy lệnh (queue worker); thêm đuôi ngẫu nhiên để nhiều worker không đá nhau
        'publisher_client_id' => env('IOT_MQTT_PUBLISHER_CLIENT_ID', 'nhanong-iot-pub'),
        'timeout_seconds' => (int) env('IOT_MQTT_TIMEOUT', 5),
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
    // Điều khiển máy bơm / quạt oxy...: lệnh quá hạn mà mạch chưa lấy thì bỏ (không để máy tự chạy muộn)
    // Gửi lệnh bật / tắt xuống thiết bị relay LoRaWAN (VD Dragino LT-22222-L)
    // The Things Stack: không cần cấu hình, địa chỉ + khóa lấy từ header của bản tin gửi lên (bật "Downlink API key" trong webhook)
    // ChirpStack v4: cần chirpstack-rest-api + API token
    'lorawan' => [
        'chirpstack_url' => env('CHIRPSTACK_API_URL'),
        'chirpstack_token' => env('CHIRPSTACK_API_TOKEN'),
        'downlink_fport' => (int) env('IOT_LORAWAN_DOWNLINK_FPORT', 2),
    ],

    'control' => [
        'command_ttl_minutes' => 10,
        // Mạch điều khiển hỏi lệnh mới mỗi N giây (firmware đọc từ phản hồi)
        'poll_seconds' => 10,
    ],
];
