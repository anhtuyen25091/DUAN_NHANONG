// Chép file này thành config.h rồi sửa cho từng thiết bị (config.h không đưa lên git vì chứa khóa).
#pragma once

// ---- Thiết bị (lấy trong /admin > Thiết bị, hoặc API POST /api/v1/devices) ----
#define DEVICE_UID "ND7K3M9QXA"
#define DEVICE_KEY "ndk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
#define FIRMWARE_VERSION "1.0.0"

// ---- Mạng (để trống WIFI_SSID nếu ruộng không có WiFi: chỉ lưu và chờ điện thoại tới lấy) ----
#define WIFI_SSID "TenWifi"
#define WIFI_PASSWORD "matkhau"
#define WIFI_CONNECT_TIMEOUT_MS 15000

// ---- Máy chủ ----
#define API_BASE "http://192.168.1.10:8001/api/v1"
// 1 = gửi qua MQTT (topic nhanong/<uid>/up), 0 = gửi qua HTTP POST /ingest
#define USE_MQTT 0
#define MQTT_HOST "192.168.1.10"
#define MQTT_PORT 1883
// Tài khoản MQTT chung cho thiết bị (deploy/mosquitto-production.conf). Để trống nếu broker cho kết nối không mật khẩu (dev)
#define MQTT_USERNAME ""
#define MQTT_PASSWORD ""

// ---- Chu kỳ ----
#define MEASURE_INTERVAL_MIN 15   // đo mỗi 15 phút, ngủ sâu giữa 2 lần đo
#define UPLOAD_BATCH 200          // số dòng mỗi lần gửi bù
#define MAX_QUEUE_BYTES 2000000   // ~2 MB (vùng LittleFS 2,4 MB) ≈ 1–2 tháng số đo 15 phút/lần; đầy thì bỏ dữ liệu cũ nhất

// ---- SMS qua module SIM800L (dự phòng khi không có WiFi). 0 = không dùng ----
// Không có WiFi thì cứ SMS_INTERVAL_HOURS giờ gửi 1 tin chứa số đo mới nhất tới số của cổng SMS
// (cổng chuyển tiếp tới POST /api/v1/sms/inbound). Dữ liệu đầy đủ vẫn nằm trong hàng đợi, gửi bù sau.
// SIM800L cần nguồn 3,7–4,2V chịu được 2A (nối thẳng pin 18650), không lấy từ chân 3V3 của ESP32.
#define USE_SMS 0
#define SMS_GATEWAY_NUMBER "+84900000000"
#define SMS_INTERVAL_HOURS 6
#define SIM_RX 32  // ESP32 nhận  <- TX của SIM800L
#define SIM_TX 33  // ESP32 gửi   -> RX của SIM800L

// ---- Chế độ chuyển dữ liệu qua điện thoại ----
// Bấm nút BOOT (GPIO0) để thiết bị phát WiFi "NHANONG-<uid>" trong PORTAL_MINUTES phút.
// Điện thoại vào WiFi đó, mở http://192.168.4.1 tải file, về nhà có mạng thì gửi file lên.
#define PORTAL_BUTTON_PIN 0
#define PORTAL_MINUTES 10
#define PORTAL_PASSWORD "nhanong123"  // ít nhất 8 ký tự

// ---- Mạch điều khiển relay (máy bơm, quạt oxy, van...). 0 = mạch đo chạy pin, ngủ sâu giữa 2 lần đo ----
// 1 = mạch cắm điện lưới, luôn bật: hỏi lệnh bật / tắt mỗi vài giây (GET /device/commands), vẫn đo + gửi số đo như thường.
// Kênh relay 1, 2, 3... ứng với RELAY_PINS[0], [1], [2]... (khai báo kênh khi thêm thiết bị điều khiển trong app).
// Mỗi lần bật mạch tự tắt khi hết số phút trong lệnh, kể cả lúc mất WiFi.
#define CONTROLLER_MODE 0
static const uint8_t RELAY_PINS[] = {27, 14, 13, 23};
#define RELAY_ACTIVE_LOW 1  // module relay phổ biến kích mức thấp (LOW = đóng)

// ---- RS485 (module MAX485 / TTL-RS485 tự động) ----
#define RS485_RX 16
#define RS485_TX 17
#define RS485_DE_RE 4      // -1 nếu module tự đảo chiều
#define RS485_BAUD 9600    // cảm biến đất 7-trong-1 thường 4800 hoặc 9600, xem nhãn / tài liệu

// ---- Đồng hồ DS3231 (I2C: SDA 21, SCL 22) — giữ giờ khi mất điện và mất mạng ----
#define USE_RTC 1

// ---- Cảm biến siêu âm chống nước AJ-SR04M đo mực nước ruộng / ao (0 = không dùng) ----
#define USE_ULTRASONIC 1
#define ULTRASONIC_TRIG 25
#define ULTRASONIC_ECHO 26
// Khoảng cách từ đầu dò tới mặt ruộng / đáy chuẩn. Mực nước = MOUNT_HEIGHT_CM - khoảng cách đo được.
#define MOUNT_HEIGHT_CM 60.0

// ---- Pin (cầu chia áp 100k/100k vào GPIO34). 0 = không đo ----
#define BATTERY_ADC_PIN 34
#define BATTERY_EMPTY_V 3.3
#define BATTERY_FULL_V 4.2

// ---- Bảng thanh ghi Modbus -> chỉ số ----
// {địa chỉ slave, thanh ghi, hệ số nhân, mã chỉ số}. Đọc bằng hàm 0x03 (holding register), giá trị có dấu 16 bit.
// Mặc định: cảm biến đất 7-trong-1 (JXBS-3001-TR và tương tự) ở địa chỉ 1.
// Mỗi hãng một bảng thanh ghi khác: luôn kiểm tra tài liệu đi kèm cảm biến.
struct ModbusPoint {
    uint8_t slave;
    uint16_t reg;
    float scale;
    const char *metric;
};

static const ModbusPoint MODBUS_POINTS[] = {
    {1, 0x0000, 0.1, "soil_moisture"},  // %
    {1, 0x0001, 0.1, "soil_temp"},      // °C
    {1, 0x0002, 1.0, "soil_ec"},        // µS/cm
    {1, 0x0003, 0.1, "soil_ph"},
    {1, 0x0004, 1.0, "soil_n"},         // mg/kg
    {1, 0x0005, 1.0, "soil_p"},
    {1, 0x0006, 1.0, "soil_k"},
    // Ví dụ thêm đầu dò pH nước RS485 (đổi địa chỉ slave của đầu dò sang 2 trước khi nối chung bus):
    // {2, 0x0000, 0.01, "water_ph"},
    // {2, 0x0001, 0.1, "water_temp"},
};
