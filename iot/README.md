# Nhà Nông IoT

API nhận dữ liệu từ thiết bị IoT nông nghiệp (độ ẩm / pH / EC / NPK đất, mực nước, pH / oxy / độ mặn nước ao, thời tiết) để nông dân tra cứu số đo theo thời gian thực và nhận cảnh báo khi vượt ngưỡng.

Đây là dự án độc lập với `../backend`. App Nhà Nông gọi API này qua token Sanctum.

| Thư mục | Nội dung |
|---|---|
| `app/` | API (`/api/v1`), trang quản trị Filament (`/admin`) |
| `firmware/esp32-modbus/` | Firmware mẫu ESP32 đọc cảm biến RS485 / siêu âm, có lưu và gửi bù khi mất mạng |
| `docs/THIET_BI.md` | Danh sách thiết bị nên dùng và cách kết nối LoRaWAN |
| `deploy/` | Mẫu cấu hình chạy thật: supervisor (queue, MQTT), Mosquitto có mật khẩu + TLS + ACL |

App Nhà Nông (`../mobile`) có mục **📡 Cảm biến ruộng · ao** ở trang chủ:
- đăng nhập tài khoản cảm biến
- tự thêm / sửa / xóa trang trại (chọn tỉnh hoặc lấy GPS), lô, thiết bị (ESP32: hiện mã + khóa để nạp firmware; LoRaWAN: DevEUI + dòng thiết bị)
- đặt ngưỡng cảnh báo cho từng lô
- dự báo thời tiết 7 ngày theo vị trí trang trại, kèm lưu ý cho ruộng / ao
- xem số đo mới nhất từng lô (so với ngưỡng), biểu đồ 24 giờ / 7 ngày / 30 ngày
- đánh dấu cảnh báo đã xử lý
- nhận thông báo đẩy khi vượt ngưỡng
- **lấy dữ liệu từ thiết bị ở ruộng không có mạng**: điện thoại vào WiFi `NHANONG-…` của thiết bị, app tải file, có mạng thì tự gửi

Địa chỉ máy chủ cho app: `EXPO_PUBLIC_IOT_URL` (dev: IP máy chạy Metro, cổng 8001).

```
Cảm biến RS485 ── ESP32 ──(WiFi/4G)── HTTP / MQTT ───────────┐
Cảm biến LoRaWAN ── gateway ── ChirpStack / TTN ── webhook ──┼─→ ReadingIngestor → MySQL → API tra cứu, cảnh báo
ESP32 ở ruộng không mạng ── WiFi riêng ── điện thoại ── file ─┤
Mạch SIM 2G ── SMS ── cổng SMS ───────────────────────────────┘
```

## Chạy môi trường dev

```bash
# Ở thư mục gốc: MySQL + Redis + Mosquitto
docker compose up -d
# Volume MySQL đã có từ trước thì script tạo DB không chạy lại; tạo tay 1 lần:
docker compose exec mysql mysql -uroot -proot -e "CREATE DATABASE IF NOT EXISTS nhanong_iot CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL ON nhanong_iot.* TO 'nhanong'@'%';"

cd iot
cp .env.example .env && php artisan key:generate   # lần đầu
php artisan migrate --seed                         # bảng + danh mục chỉ số + ánh xạ trường LoRaWAN
php artisan make:filament-user
php artisan admin:grant email@cua-ban.vn
php artisan serve --port=8001                      # API: http://localhost:8001/api/v1, admin: /admin
php artisan queue:work                             # xét ngưỡng cảnh báo
php artisan schedule:work                          # gộp số đo theo giờ, dọn dữ liệu cũ
php artisan iot:mqtt-listen                        # nếu thiết bị gửi qua MQTT
```

## Thử khi chưa có phần cứng

```bash
# Tạo trang trại, lô, thiết bị trong /admin rồi lấy mã thiết bị (uid)
php artisan iot:simulate ND7K3M9QXA --hours=24 --interval=15 --offline=6
#   → 18 giờ gửi đều đặn, 6 giờ cuối "mất mạng", cuối cùng gửi bù 1 lô
php artisan iot:simulate ND7K3M9QXA --lorawan    # thiết bị LoRaWAN: đi qua webhook ChirpStack
```

## API

**Thiết bị gửi số đo** (header `Authorization: Bearer <khóa thiết bị>`, giới hạn 120 lần/phút/thiết bị):

| | |
|---|---|
| `POST /ingest` | `{"firmware": "1.0.0", "readings": [{"metric": "soil_ph", "value": 6.4, "t": 1730170000}]}`. Mỗi lô tối đa 2.000 dòng. `t` là epoch giây hoặc chuỗi ISO; bỏ trống thì lấy giờ nhận. |
| `POST /ingest/compact` | Thân dạng văn bản, mỗi dòng `t,metric,value`, dành cho mạch yếu |
| `GET /device/time` | Giờ máy chủ, để thiết bị chỉnh đồng hồ |

Phản hồi: `{"accepted": 3, "duplicates": 0, "rejected": [{"index": 1, "reason": "out_of_range"}], "server_time": 1730170123}`.

Các lý do bị loại:
- `unknown_metric`: mã chỉ số không có
- `invalid_value`: giá trị không phải số
- `out_of_range`: ngoài khoảng hợp lệ, coi như cảm biến lỗi
- `invalid_time`: giờ đo không hợp lệ
- `too_old`: cũ hơn 90 ngày
- `future_time`: giờ đo ở tương lai

Gửi lại cùng số đo thì được tính vào `duplicates`, không bị nhân đôi.

**Mạch điều khiển relay** (cùng khóa thiết bị):

| | |
|---|---|
| `GET /device/commands?states=1:1,2:0` | Lấy lệnh đang chờ (kèm trạng thái relay hiện tại). Trả `{"commands": [{"id": 12, "channel": 1, "action": "on", "minutes": 30}], "poll_seconds": 10}`. Lệnh chưa báo kết quả thì gửi lại; mạch bỏ qua id đã làm. |
| `POST /device/commands/{id}/ack` | `{"ok": true, "states": "1:1,2:0"}` hoặc `{"ok": false, "message": "…"}` (báo lỗi về điện thoại) |
| `POST /ingest` | Mạch có relay thì phản hồi kèm `commands` như trên |

**Mạch relay LoRaWAN** (Dragino LT-22222-L, chọn dòng `dragino-lt22222` khi thêm thiết bị; kênh 1–2):
- Bấm bật / tắt: máy chủ đẩy lệnh `03 aa bb` xuống (`01` đóng relay, `00` mở, `11` giữ nguyên) qua network server, cổng `IOT_LORAWAN_DOWNLINK_FPORT` (mặc định 2).
  - The Things Stack: bật "Downlink API key" trong webhook. Bản tin gửi lên có header `X-Downlink-Push` / `X-Downlink-Apikey`, máy chủ tự lưu, không cần cấu hình gì thêm.
  - ChirpStack v4: chạy `chirpstack-rest-api`, khai báo `CHIRPSTACK_API_URL` + `CHIRPSTACK_API_TOKEN`.
- Mạch làm xong gửi lên `RO1_status` / `RO2_status` (decoder chuẩn của TTN / Dragino) thì lệnh mới tính là đã làm.
- Mạch LoRaWAN không tự đếm giờ như ESP32: hết số phút thì `commands:expire` gửi lệnh tắt. Mất sóng lúc đó thì máy không tự tắt, nên với máy bơm quan trọng nên dùng mạch ESP32.

**Không có Internet ở ruộng:**

| | |
|---|---|
| `POST /ingest/upload` | Điện thoại gửi file tải từ thiết bị (trường `file` hoặc `content`). Dòng đầu `#nhanong uid=… sig=<HMAC-SHA256>`. Không cần đăng nhập vì chữ ký chứng minh nguồn gốc. |
| `POST /sms/inbound` | Cổng SMS chuyển tiếp tin nhắn (trường `text`), header `X-Webhook-Secret: IOT_SMS_SECRET`. Nội dung tin: `<uid> <16 ký tự đầu chữ ký> <dữ liệu>`. Dữ liệu là `t,metric,value;…`, hoặc dạng gọn cho 1 lần đo (vừa 1 tin 160 ký tự): `@<t>;soil_ph=6.2;salinity=4.6`. |
| `POST /lorawan/chirpstack`, `POST /lorawan/ttn` | Webhook của network server LoRaWAN. Header `X-Webhook-Secret: IOT_LORAWAN_SECRET`. |
| MQTT `nhanong/<uid>/up` | Nội dung giống `/ingest`, thêm `"key"`. Chạy `php artisan iot:mqtt-listen` để nhận (MQTT 3.1.1, QoS 1, mã client cố định `IOT_MQTT_CLIENT_ID`). |

Số đo gửi bù cũ hơn 24 giờ chỉ được lưu lại, không bắn cảnh báo muộn.

**Người dùng** (token Sanctum từ `POST /auth/register`, `POST /auth/login`):

| | |
|---|---|
| `GET /metrics` | Danh mục chỉ số (không cần đăng nhập) |
| `GET/POST /farms`, `PUT/DELETE /farms/{id}` | Trang trại (của mình và được chia sẻ; `role`: `owner` / `operator` / `viewer`) |
| `GET/POST /farms/{id}/members` (`{"email": "…", "role": "operator\|viewer"}`), `PUT/DELETE /farm-members/{id}` | Chia sẻ trang trại cho người đã có tài khoản cảm biến. `operator` được bật / tắt máy + xử lý cảnh báo; `viewer` chỉ xem. Chỉ chủ được thêm / sửa / xóa; người được chia sẻ tự rời được (xóa chính mình). Mọi người đều nhận thông báo. |
| `GET /farms/{id}/rainfall?days=30` | Lượng mưa từng ngày tại vị trí trang trại (`rain_mm`: dữ liệu thời tiết; `gauge_mm`: máy đo mưa nếu có). Miễn phí xem 30 ngày; tài khoản đã nối với tài khoản Nhà Nông có gói xem 365 ngày. |
| `PUT /me/nhanong` (`{"token": "<token đăng nhập Nhà Nông>"}`), `DELETE /me/nhanong` | Nối / bỏ nối tài khoản Nhà Nông để dùng chung gói trả phí. App tự nối khi máy đăng nhập cả 2 tài khoản. `GET /me` có thêm `plan`. |
| `GET /farms/{id}/weather` | Dự báo 7 ngày (Open-Meteo, lưu 1 giờ) + mưa 24 giờ tới + lưu ý (mưa lớn với ao, mưa với ruộng / vườn, nắng nóng ≥ 35°C, gió ≥ 10 m/s). Trang trại cần có `lat` / `lng`. |
| `POST /farms/{id}/plots`, `PUT/DELETE /plots/{id}` | Lô / ruộng / ao (`field`, `garden`, `pond`, `greenhouse`, `other`) |
| `GET /plots/{id}/summary` | Số đo mới nhất của lô, so với ngưỡng, kèm cảnh báo đang mở và `role` của người xem |
| `GET /plots/{id}/export?days=30&format=xlsx\|csv` | Tải số đo thô của lô (tối đa 180 ngày, giờ Việt Nam). Mặc định file Excel thật, vì CSV mở bằng Excel máy tiếng Việt hay bị dồn 1 cột. |
| `GET/POST /devices`, `GET/PUT/DELETE /devices/{id}` | Thiết bị. Tạo mới trả `api_key` (chỉ 1 lần) |
| `POST /devices/{id}/rotate-key` | Tạo khóa mới |
| `GET /device-profiles` | Dòng thiết bị LoRaWAN đã khai báo ánh xạ trường + dòng mạch relay (để chọn khi thêm thiết bị) |
| `GET /devices/{id}/latest` | Số đo mới nhất từng chỉ số |
| `GET /devices/{id}/readings?metric=soil_ph&from=&to=&interval=raw\|hour\|day` | Lịch sử để vẽ biểu đồ |
| `GET/POST /plots/{id}/thresholds`, `DELETE /thresholds/{id}` | Ngưỡng cảnh báo (`min` / `max`) |
| `GET /crop-presets`, `POST /plots/{id}/apply-preset` (`{"preset": "sau-rieng"}`) | Gợi ý theo cây trồng (sầu riêng, cà phê vối, hồ tiêu): ngưỡng, lịch tưới, khóa an toàn, kèm nguồn tài liệu |
| `GET /alerts?open=1`, `POST /alerts/{id}/resolve` | Cảnh báo |
| `GET /plots/{id}/actuators`, `POST /devices/{id}/actuators`, `PUT/DELETE /actuators/{id}` | Thiết bị điều khiển (máy bơm, quạt oxy, van…) gắn vào kênh relay của mạch ESP32 hoặc mạch relay LoRaWAN. Khóa an toàn: `block_device_id`, `block_metric`, `block_operator`, `block_value` (VD độ mặn nước nguồn > 0,3‰ thì không cho bơm, đang chạy thì tắt) |
| `POST /actuators/{id}/command` (`{"action": "on", "minutes": 30}`), `GET /actuators/{id}/commands` | Bật / tắt bằng tay, lịch sử lệnh. Bật luôn có số phút (≤ `max_minutes`); lệnh mới thay lệnh cũ chưa làm; mạch không nhận trong 10 phút thì lệnh hủy (không tự chạy muộn) và báo về điện thoại |
| `GET /plots/{id}/schedules`, `POST /actuators/{id}/schedules`, `PUT/DELETE /schedules/{id}` | Lịch tưới: `{"start_time": "05:30", "minutes": 40, "every_days": 20, "months": [12,1,2,3,4], "skip_rain_mm": 10}`. `months` null = cả năm; mưa từ `skip_rain_mm` (từ hôm qua tới giờ) thì bỏ lượt |
| `GET/POST /plots/{id}/rules`, `PUT/DELETE /rules/{id}` | Luật tự động: `{"metric": "water_do", "operator": "below", "value": 4, "off_value": 5, "actuator_id": 1, "minutes": 60, "cooldown_minutes": 30}`. Chạy mỗi khi có số đo mới của lô; tự bật thì báo về điện thoại; chỉ tự tắt máy do chính luật đã bật (không tắt máy người dùng bật tay) |
| `PUT /me/push-token`, `DELETE /me/push-token` | Expo push token của máy (`{"token": "ExponentPushToken[…]", "platform": "android"}`). Khi một chỉ số vừa vượt ngưỡng, máy nhận thông báo (kênh Android `iot-alerts`); vượt tiếp thì không báo lặp. |

## Lệnh

| Lệnh | Việc |
|---|---|
| `readings:rollup` | Gộp số đo theo giờ (lịch: 15 phút/lần). Tính lại cả những giờ có dữ liệu gửi bù. |
| `readings:prune` | Xóa số đo thô cũ hơn 180 ngày (lịch: 3:30 hằng ngày). Bảng gộp theo giờ vẫn giữ. |
| `devices:check-health` | Báo chủ trang trại khi thiết bị không gửi số đo quá 24 giờ, hoặc pin dưới 20% (lịch: 30 phút/lần). Mỗi sự cố chỉ báo 1 lần, tới khi thiết bị gửi lại / pin lên trên 30%. |
| `weather:rain-watch` | 15 phút / lần: xem mưa tại vị trí mọi trang trại (Open-Meteo, gọi gộp 50 vị trí / lần). Trời bắt đầu mưa thì báo chủ vườn "🌧️ … đang mưa" (mỗi cơn 1 lần, cách nhau ≥ 3 giờ; tạnh 1 giờ mới hết cơn). Vườn có máy đo mưa (chỉ số `rainfall`) thì báo ngay khi máy ghi nhận mưa. Tắt được theo từng trang trại (`rain_alerts`). |
| `weather:sync-rain --days=2` | Mỗi giờ: lưu lượng mưa từng ngày (bảng `farm_rain_daily`). Trang trại vừa có / đổi vị trí thì tự lấy 1 năm. Ngày đã qua lấy từ API lưu trữ, hôm nay cộng các giờ đã qua; ngày không có số liệu để trống (không ghi 0). |
| `iot:mqtt-listen` | Nghe MQTT. Chạy liên tục bằng supervisor. |
| `iot:simulate` | Giả lập thiết bị |
| `iot:simulate-controller <uid>` | Giả lập mạch điều khiển relay: nhận lệnh bật / tắt, tự tắt khi hết giờ (để thử app khi chưa có phần cứng) |
| `commands:expire` | Mỗi phút: hủy lệnh bật / tắt quá 10 phút mà mạch chưa nhận, báo chủ trang trại; gửi lệnh tắt cho máy LoRaWAN hết giờ chạy |
| `schedules:run` | Mỗi phút: chạy lịch tưới tới giờ (bỏ lượt khi đã mưa đủ / ngoài mùa / khóa an toàn chặn) |
| `weather:dry-spell` | 7:00 hằng ngày: nhắc trang trại đã N ngày liên tiếp không mưa (`dry_alert_days`) |
| `admin:grant` | Cấp quyền vào `/admin` |
