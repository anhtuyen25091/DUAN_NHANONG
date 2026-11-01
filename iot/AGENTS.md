# Nhà Nông IoT

Laravel 13 (PHP 8.4), Filament 5, Sanctum. API nhận số đo từ thiết bị IoT nông nghiệp; độc lập với `../backend`, nhưng theo cùng quy ước của `../backend/CLAUDE.md`: controller trong `Api/V1`, route `/api/v1` có tên `api.v1.*`, throttle khai báo ngay trên route, chú thích tiếng Việt, test Feature bằng PHPUnit.

- Mọi số đo đi qua `App\Services\ReadingIngestor` (HTTP, MQTT, LoRaWAN, điện thoại chuyển tiếp, SMS, giả lập).
- Số đo lưu theo giờ đo trên thiết bị. Khóa duy nhất là (device_id, metric_id, measured_at).
- Chạy test: `php artisan test`. Định dạng code: `vendor/bin/pint --dirty`.
- Firmware mẫu: `firmware/esp32-modbus` (PlatformIO).
