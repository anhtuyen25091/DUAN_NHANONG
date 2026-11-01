# Firmware mẫu ESP32

Đọc cảm biến rồi gửi về API Nhà Nông IoT. Khi mất mạng, số đo được lưu lại và gửi bù sau.

## Linh kiện

| Linh kiện | Ghi chú | Giá tham khảo |
|---|---|---|
| ESP32 DevKit (ESP32-WROOM-32) | | ~100.000đ |
| Module TTL ↔ RS485 (MAX485) | Loại tự đảo chiều không cần chân DE/RE | ~20.000đ |
| Cảm biến đất 7-trong-1 RS485 (độ ẩm, nhiệt độ, EC, pH, N, P, K) | JXBS-3001-TR hoặc loại tương tự, cấp nguồn 5–30V | 20–45 USD |
| Cảm biến siêu âm chống nước AJ-SR04M | Đo mực nước ruộng / ao | ~80.000đ |
| Đồng hồ thời gian thực DS3231 (có pin CR2032) | Giữ đúng giờ đo khi mất điện, mất mạng | ~40.000đ |
| Pin 18650 + tấm pin mặt trời 6V + mạch sạc TP4056 | Hoặc nguồn 12V có sẵn | |
| Mạch hạ áp lên 12V (MT3608) | Cấp nguồn cho cảm biến RS485 nếu dùng pin | ~15.000đ |
| Module SIM800L + SIM 2G (tùy chọn) | Gửi SMS số đo khi không có WiFi | ~70.000đ |

## Nối dây

```
ESP32            MAX485               Cảm biến đất 7-trong-1
GPIO17 (TX) ──── DI                   nâu  ── 12V (5–30V)
GPIO16 (RX) ──── RO                   đen  ── GND (chung GND với ESP32)
GPIO4  ──────── DE + RE (nối chung)   vàng ── A  ── A (MAX485)
3V3 / GND ───── VCC / GND             xanh ── B  ── B (MAX485)

ESP32            DS3231               AJ-SR04M (siêu âm)
GPIO21 ───────── SDA                  GPIO25 ── Trig
GPIO22 ───────── SCL                  GPIO26 ── Echo (qua cầu chia áp 5V→3,3V)
3V3 / GND ────── VCC / GND            5V / GND

ESP32            SIM800L (tùy chọn, USE_SMS 1)
GPIO32 ───────── TXD                  VCC ── thẳng cực + pin 18650 (3,7–4,2V, chịu 2A; KHÔNG lấy từ 3V3)
GPIO33 ───────── RXD                  GND ── GND chung

Pin: cực + ── 100k ── GPIO34 ── 100k ── GND
Nút BOOT (GPIO0) có sẵn trên mạch: bấm để bật chế độ cho điện thoại tải dữ liệu.
```

Màu dây khác nhau tùy hãng, nên xem nhãn trên cảm biến. Nếu nối nhiều cảm biến RS485 chung một bus A/B, mỗi cảm biến phải có địa chỉ slave khác nhau (đổi bằng phần mềm của hãng hoặc ghi vào thanh ghi địa chỉ).

## Cài đặt

1. Cài [PlatformIO](https://platformio.org/install/cli).
2. Thêm thiết bị trong `/admin` > Thiết bị (loại ESP32). Chép **mã thiết bị** và **khóa** (khóa chỉ hiện 1 lần).
3. Chép cấu hình mẫu rồi sửa:
   ```bash
   cp include/config.example.h include/config.h
   ```
   Điền `DEVICE_UID`, `DEVICE_KEY`, WiFi, `API_BASE` và bảng thanh ghi `MODBUS_POINTS` theo tài liệu của cảm biến.
4. Nạp firmware:
   ```bash
   pio run -t upload && pio device monitor
   ```

Bảng phân vùng riêng (`partitions.csv`): 1,5 MB cho chương trình, 2,4 MB LittleFS cho hàng đợi số đo. Không có cập nhật firmware qua mạng (OTA). Đã biên dịch thử cho `esp32dev` với cả bản mặc định (HTTP) và bản bật MQTT + SMS.

## Khi không có Internet

| Tình huống | Firmware làm gì |
|---|---|
| WiFi chập chờn, mất mạng vài giờ đến vài ngày | Số đo nằm trong hàng đợi `/queue.csv` trên flash (khoảng 1,2 MB, đủ vài tuần nếu đo 15 phút/lần). Khi có mạng lại, firmware gửi bù theo lô 200 dòng. Lô nào máy chủ trả 200 thì mới đánh dấu đã gửi. |
| Ruộng hoàn toàn không có mạng | Bấm nút BOOT, thiết bị phát WiFi `NHANONG-<mã>` (mật khẩu `PORTAL_PASSWORD`) trong 10 phút. Điện thoại vào WiFi đó, mở `http://192.168.4.1`, bấm **Tải file dữ liệu**. Về nơi có mạng thì gửi file lên `POST /api/v1/ingest/upload` (trường `file`). File có chữ ký HMAC bằng khóa thiết bị nên không sửa được. |
| Chưa từng có mạng để lấy giờ | Có DS3231 thì giờ vẫn đúng. Không có thì bấm **Chỉnh giờ theo điện thoại** trên trang `192.168.4.1`. Những dòng chưa có giờ sẽ được máy chủ lấy giờ lúc nhận. |
| Có SIM 2G, không có WiFi (`USE_SMS 1`) | Cứ 6 giờ gửi 1 tin SMS chứa số đo mới nhất (dạng gọn `@<giờ>;soil_ph=6.2;…`, có chữ ký) tới số của cổng SMS. Cổng chuyển tiếp tới `POST /api/v1/sms/inbound`. Dữ liệu đầy đủ vẫn nằm trong hàng đợi để gửi bù. |
| Điện thoại có app Nhà Nông | Mục 📡 Cảm biến › **Lấy dữ liệu từ thiết bị**: app tự tải file từ `192.168.4.1`, có mạng thì tự gửi lên. Không cần thao tác với file. |
| Gửi trùng (mất phản hồi giữa chừng, tải file 2 lần) | Không sao. Máy chủ bỏ qua số đo đã có (cùng thiết bị, chỉ số, giờ đo). |

Muốn dùng LoRa thay WiFi thì dùng cảm biến LoRaWAN thương mại (Dragino, Milesight, SenseCAP) qua gateway. Xem [docs/THIET_BI.md](../../docs/THIET_BI.md).

## Mạch điều khiển máy bơm / quạt oxy (`CONTROLLER_MODE 1`)

Dùng cho mạch cắm điện lưới, đặt trong tủ điện cạnh ao / ruộng, có module relay (loại 4 kênh kích mức thấp phổ biến):

```
ESP32 GPIO27 ── IN1 (kênh 1)     ESP32 GPIO14 ── IN2 (kênh 2)
ESP32 GPIO13 ── IN3 (kênh 3)     ESP32 GPIO23 ── IN4 (kênh 4)
5V / GND ────── VCC / GND        Tiếp điểm COM / NO của relay đóng cắt cuộn khởi động từ (contactor) của máy bơm, quạt
```

⚠️ Máy bơm, quạt oxy chạy điện 220V / 380V công suất lớn: relay chỉ đóng cắt **cuộn điều khiển của khởi động từ**, không đấu thẳng động cơ vào relay. Phần điện lực nhờ thợ điện lắp, có CB / aptomat chống giật.

- Mạch không ngủ sâu: cứ `poll_seconds` (máy chủ trả về, mặc định 10 giây) hỏi lệnh `GET /device/commands`, bật / tắt relay rồi báo lại `POST /device/commands/{id}/ack`; vẫn đo và gửi số đo theo `MEASURE_INTERVAL_MIN`.
- Mỗi lần bật mạch **tự tắt khi hết số phút** trong lệnh, kể cả khi mất WiFi. Mất điện có lại: tắt hết, chờ lệnh mới.
- Trong app: màn hình lô › ⚙️ Điều khiển › ＋ Thêm thiết bị (chọn mạch, kênh relay). Luật tự động: ⚡ Luật tự động (VD DO < 4 bật quạt oxy, DO ≥ 5 tắt).
- Chưa có mạch: `php artisan iot:simulate-controller <mã mạch>` giả lập mạch để thử app.

## Gửi qua MQTT

Đặt `USE_MQTT 1`. Firmware publish lên topic `nhanong/<mã thiết bị>/up` với nội dung giống `POST /ingest`, kèm thêm trường `"key"`. Trên máy chủ chạy `php artisan iot:mqtt-listen`. Broker chạy thật cần tài khoản: điền `MQTT_USERNAME` / `MQTT_PASSWORD` (xem `deploy/mosquitto-production.conf`).

Lưu ý: firmware publish ở QoS 0, nghĩa là không có xác nhận từ máy chủ. Nếu cần chắc chắn dữ liệu đã tới nơi thì dùng HTTP.

## HTTPS / MQTT có mã hóa

- Chạy thật: đặt `API_BASE` dạng `https://…` và dán chứng chỉ gốc của máy chủ (PEM) vào `TLS_ROOT_CA`. Ví dụ máy chủ dùng Let's Encrypt thì lấy "ISRG Root X1" ở letsencrypt.org/certificates, hoặc chứng chỉ cuối cùng khi chạy `openssl s_client -connect iot.tenmien.vn:443 -showcerts </dev/null`.
- `https` mà chưa có chứng chỉ thì thiết bị **không gửi**, để tránh gửi khóa cho máy chủ giả. `TLS_INSECURE 1` chỉ dùng để thử.
- MQTT: `MQTT_TLS 1` + `MQTT_PORT 8883`, dùng chung `TLS_ROOT_CA`.

## Đổi cấu hình từ xa

Chu kỳ đo đặt trong app, web hoặc `/admin` (Thiết bị › Chu kỳ đo, 5–240 phút). Máy chủ gửi kèm phản hồi `/ingest` và `/device/commands` (`"config": {"measure_interval_min": 30}`). Thiết bị lưu vào `/config.json`, mất điện vẫn giữ. Gửi qua MQTT thì không nhận được (MQTT không có phản hồi).

## Cập nhật firmware qua mạng (OTA)

1. Build bằng môi trường có 2 vùng chương trình: `pio run -e esp32dev-ota -t upload`. Lần đầu nạp bằng cáp. Vùng LittleFS còn ~640 KB nên hàng đợi khi mất mạng giữ được khoảng 2–3 tuần số đo 15 phút/lần (bản thường `esp32dev`: 1–2 tháng, nhưng không cập nhật qua mạng được).
2. Bản mới: tăng `FIRMWARE_VERSION`, chạy `pio run -e esp32dev-ota`, tải `.pio/build/esp32dev-ota/firmware.bin` lên `/admin` › Cập nhật firmware, chọn đúng thiết bị.
   - Khóa thiết bị + WiFi nằm sẵn trong firmware, nên **mỗi file chỉ dùng cho 1 thiết bị**.
3. Lần gửi số đo tới, máy chủ báo `firmware_update`. Thiết bị tải `GET /device/firmware` (khóa thiết bị), thư viện HTTPUpdate kiểm MD5 rồi mới ghi, xong thì khởi động lại. Gửi số đo kèm version mới thì trang quản trị ghi "Đã cài".
   - Mạch điều khiển chỉ cập nhật khi không máy nào đang chạy.
   - Tải lỗi (mất mạng giữa chừng, sai MD5) thì vẫn chạy bản cũ, lần sau thử lại.
