# Thiết bị IoT nông nghiệp có thể kết nối

Danh sách tổng hợp từ trang người bán, tài liệu hãng và nghiên cứu (tháng 10/2026). Giá và thông số chỉ để tham khảo, cần đối chiếu với datasheet của hãng trước khi mua.

## Hai cách đưa thiết bị vào hệ thống

| Cách | Thiết bị | Ưu điểm | Nhược điểm |
|---|---|---|---|
| **Tự lắp**: cảm biến RS485/Modbus + mạch ESP32 ([firmware mẫu](../firmware/esp32-modbus)) | Cảm biến công nghiệp giá rẻ (đất 7-trong-1, pH, DO, EC) | Rẻ, đo được nhiều chỉ số cùng lúc trên 1 dây | Cần WiFi/4G, hoặc điện thoại ra ruộng lấy dữ liệu; phải tự làm hộp chống nước và nguồn |
| **Mua sẵn**: cảm biến LoRaWAN + gateway | Dragino, Milesight, SenseCAP | Không cần SIM, chạy pin nhiều năm, sóng đi 2–10 km | Đắt hơn, cần 1 gateway và network server (ChirpStack / The Things Stack) |

## Đất

| Thiết bị | Đo | Giao tiếp | Ghi chú |
|---|---|---|---|
| Cảm biến đất 7-trong-1 (JXBS-3001-TR và các loại tương tự) | Độ ẩm, nhiệt độ, EC, pH, N, P, K | RS485 Modbus RTU, nguồn 5–30V, IP68 | Khoảng 20–45 USD. Bảng thanh ghi mỗi hãng một khác. Số đo N/P/K chỉ mang tính ước lượng, cần hiệu chỉnh theo loại đất |
| Dragino SE01-LB / LSE01 | Độ ẩm, nhiệt độ, EC | LoRaWAN, pin | Profile `dragino-se01`. Cần hiệu chỉnh theo loại đất |
| Milesight EM500-SMTC | Độ ẩm, nhiệt độ, EC | LoRaWAN, pin | Profile `milesight-em500-smtc` |
| Seeed SenseCAP S2104 / S2105 | Độ ẩm, nhiệt độ (S2105 có thêm EC) | LoRaWAN | Profile `sensecap-s2105` |

## Nước (ao tôm, ao cá, ruộng lúa – tôm)

| Thiết bị | Đo | Giao tiếp | Ghi chú |
|---|---|---|---|
| Meacon MIK-PH8001 | pH / ORP | RS485 Modbus, mặc định 9600-8N1, địa chỉ 0x01 | Phải đổi địa chỉ nếu nối chung bus với cảm biến khác |
| Đầu đo DFRobot RS485 (ORP, DO quang học...) | ORP ±1999 mV, oxy hòa tan | RS485 Modbus, IP68 | Đầu đo DO và ORP cần hiệu chỉnh định kỳ |
| Đầu đo độ dẫn điện Winsen | EC 0–20.000 µS/cm (quy ra độ mặn) | RS485 hoặc 4–20 mA | |

Lưu ý: đầu đo pH phải ngâm trong dung dịch bảo quản khi không đo, nếu không sẽ sai số nhanh.

## Mực nước (tưới ngập khô xen kẽ – AWD, bể, kênh)

| Thiết bị | Cách đo | Giao tiếp |
|---|---|---|
| AJ-SR04M | Siêu âm chống nước, gắn trên ống AWD | Nối thẳng vào ESP32 (đã có trong firmware mẫu) |
| Milesight EM500-SWL | Đầu dò thả chìm | LoRaWAN. Profile `milesight-em500-swl` |
| Dragino PS-LB | Đầu dò áp suất thả chìm | LoRaWAN. Profile `dragino-ps-lb` |
| Cảm biến siêu âm LoRaWAN | Đo khoảng cách tới mặt nước, tới 8 m | LoRaWAN |

## Thời tiết

| Thiết bị | Đo | Ghi chú |
|---|---|---|
| Seeed SenseCAP S2120 | Trạm 8-trong-1: nhiệt độ, độ ẩm, ánh sáng, gió, mưa... | LoRaWAN. Profile `sensecap-s2120` |
| Máy đo mưa LoRaWAN | Lượng mưa | Tên trường khác nhau theo hãng: khai báo trong /admin > Ánh xạ trường |

## Gateway LoRaWAN

Dragino LPS8 / DLOS8, Milesight UG65. Đặt gateway ở nơi có Internet (nhà dân, ủy ban xã). Một gateway phục vụ được nhiều hộ trong bán kính vài km.

## Kết nối cảm biến LoRaWAN vào hệ thống

1. Thêm thiết bị trong `/admin` > Thiết bị: chọn loại kết nối LoRaWAN, nhập DevEUI, chọn dòng thiết bị (profile).
2. Trên network server, bật decoder (payload formatter) chính hãng cho thiết bị.
3. Tạo webhook, gửi kèm header `X-Webhook-Secret: <IOT_LORAWAN_SECRET>`:
   - ChirpStack v4 (HTTP integration, event `up`): `POST https://<máy chủ>/api/v1/lorawan/chirpstack`
   - The Things Stack (Webhook, Uplink message): `POST https://<máy chủ>/api/v1/lorawan/ttn`
4. Gặp dòng thiết bị mới: thêm ánh xạ "tên trường → chỉ số" trong `/admin` > Ánh xạ trường. Nếu decoder đã trả về đúng mã chỉ số (`soil_ph`, `water_level`...) thì dùng profile `generic`, không cần khai báo gì thêm.

Tên trường trong bảng ánh xạ có sẵn lấy theo decoder chính hãng. Hãy kiểm tra lại bằng một bản tin thật, vì tên trường có thể đổi theo phiên bản decoder.

## Giải pháp đã có ở Việt Nam (để tham khảo)

- **MimosaTEK** (TP.HCM): tưới thông minh, đo độ ẩm đất, mưa, gió, ánh sáng; đo mực nước ruộng lúa (thí điểm cùng Đại học Trà Vinh).
- **RYNAN Technologies**: hệ thống AWD, cống, máy bơm, cảm biến đất chạy năng lượng mặt trời (ứng dụng RYNAN-MEKONG); TOMGOXY theo dõi chất lượng nước ao tôm.
- Đại học Cần Thơ: quan trắc độ mặn, pH, NH4, DO, nhiệt độ cho mô hình lúa – tôm ở An Biên, Kiên Giang.

## Nguồn

- [7-in-1 RS485 soil sensor (Sigmanortec)](https://sigmanortec.ro/en/7-in-1-soil-sensor-n-p-k-ph-ec-moisture-temperature-rs485-530v)
- [JXBS-3001-TR (techiesms)](https://techiesms.com/?p=18019)
- [Cảm biến đất LoRaWAN (Industrial Monitor Direct)](https://industrialmonitordirect.com/blogs/knowledgebase/iot-lorawan-soil-sensors-for-agricultural-monitoring)
- [SenseCAP soil sensor (Botland)](https://botland.com.pl/en/multifunctional-sensors/16985-sensecap-wireless-soil-moisture-and-temperature-sensor-lorawan-868mhz-seeedstudio-101990564.html)
- [DFRobot RS485 ORP](https://pakronics.com.au/products/industrial-grade-rs485-water-quality-orp-sensor-modbus-rtu-ip68-df-sen0709)
- [MIK-PH8001](https://www.controleng.com/?p=130375)
- [Hệ thống IoT ao tôm Việt Nam (BEEI)](https://journal.beei.org/index.php/EEI/article/view/5180)
- [Đại học Cần Thơ, lúa – tôm](https://ctujs.ctu.edu.vn/index.php/ctujs/article/view/711)
- [Đo mực nước ruộng lúa (ASEE)](https://peer.asee.org/47754)
- [Milesight submersible sensor](https://www.agtech.dpi.nsw.gov.au/collections/asset/products/milesight-submersible-sensor)
- [MimosaTEK](https://securingwaterforfood.org/innovators/mimosatek)
- [World Bank, tưới lúa thông minh](https://www.worldbank.org/en/news/video/2020/04/06/a-smarter-way-to-grow-rice)
- [RYNAN](https://digital.growasia.org/solutions/rynan-technologies)
- [The Things Stack Application Server](https://www.thethingsindustries.com/docs/concepts/architecture/components/application-server/)
- [Decoder Milesight trên ChirpStack](https://wz-it.com/knowledge/iot/milesight-payload-decoder/)
