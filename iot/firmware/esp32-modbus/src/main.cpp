// Nhà Nông IoT — firmware mẫu ESP32.
//
// Mỗi lần thức dậy (mặc định 15 phút):
//   1. Đọc cảm biến RS485/Modbus (đất 7-trong-1, pH nước...), siêu âm mực nước, pin.
//   2. Ghi số đo kèm giờ đo vào hàng đợi trên flash (/queue.csv, mỗi dòng "t,metric,value").
//   3. Có WiFi thì gửi bù toàn bộ hàng đợi theo lô; máy chủ trả 200 mới đánh dấu đã gửi.
//      Gửi trùng không sao: máy chủ bỏ qua số đo đã có (cùng thiết bị, chỉ số, giờ đo).
//   4. Ngủ sâu.
// Ruộng không có mạng: bấm nút BOOT, thiết bị phát WiFi "NHANONG-<uid>"; điện thoại vào http://192.168.4.1
// tải file dữ liệu (có chữ ký HMAC bằng khóa thiết bị), về nơi có mạng thì gửi file lên POST /ingest/upload.
// API_BASE https:// thì kiểm chứng chỉ máy chủ (TLS_ROOT_CA). Máy chủ gửi kèm phản hồi:
//   - "config": cấu hình đổi từ xa (chu kỳ đo), lưu vào /config.json
//   - "firmware_update": có bản mới (chỉ bản build -e esp32dev-ota): tải GET /device/firmware, kiểm MD5, khởi động lại

#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <HTTPUpdate.h>
#include <LittleFS.h>
#include <ModbusMaster.h>
#include <PubSubClient.h>
#include <RTClib.h>
#include <WebServer.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <algorithm>
#include <esp_sleep.h>
#include <mbedtls/md.h>
#include <sys/time.h>
#include <time.h>

#include "config.h"

// Mặc định cho config.h cũ (trước khi có các mục này)
#ifndef TLS_ROOT_CA
#define TLS_ROOT_CA ""
#endif
#ifndef TLS_INSECURE
#define TLS_INSECURE 0
#endif
#ifndef MQTT_TLS
#define MQTT_TLS 0
#endif
// Bật bằng môi trường build esp32dev-ota (2 vùng chương trình nên vùng LittleFS chỉ còn ~640 KB)
#ifndef OTA_ENABLED
#define OTA_ENABLED 0
#endif
#if OTA_ENABLED && MAX_QUEUE_BYTES > 500000
#undef MAX_QUEUE_BYTES
#define MAX_QUEUE_BYTES 500000  // ≈ 2–3 tuần số đo 15 phút/lần
#endif

static const char *QUEUE_FILE = "/queue.csv";
static const char *POS_FILE = "/queue.pos";
static const char *TMP_FILE = "/queue.tmp";
static const char *CONFIG_FILE = "/config.json";
// Trước mốc này coi như đồng hồ chưa được chỉnh
static const time_t VALID_EPOCH = 1700000000;

// Giữ qua các lần ngủ sâu
RTC_DATA_ATTR time_t nextMeasureAt = 0;
RTC_DATA_ATTR time_t lastSmsAt = 0;

// Số đo của lần thức này dạng gọn cho SMS: "@<t>;soil_ph=6.2;salinity=4.6"
String smsSnapshot;

RTC_DS3231 rtc;
bool rtcOk = false;
ModbusMaster modbus;

// ================= Mạng: HTTP / HTTPS =================

WiFiClient plainNet;
WiFiClientSecure secureNet;

// Kết nối cho http:// hoặc https://. https mà chưa khai báo chứng chỉ gốc thì từ chối (trừ khi TLS_INSECURE để thử)
NetworkClient *netFor(bool tls) {
    if (!tls) return &plainNet;
    if (strlen(TLS_ROOT_CA) > 0) {
        secureNet.setCACert(TLS_ROOT_CA);
    } else if (TLS_INSECURE) {
        secureNet.setInsecure();
    } else {
        Serial.println("Máy chủ dùng https nhưng chưa khai báo TLS_ROOT_CA trong config.h");
        return nullptr;
    }
    return &secureNet;
}

bool beginHttp(HTTPClient &http, const String &url) {
    NetworkClient *net = netFor(url.startsWith("https://"));
    if (net == nullptr || !http.begin(*net, url)) return false;
    http.addHeader("Accept", "application/json");
    http.addHeader("Authorization", String("Bearer ") + DEVICE_KEY);
    return true;
}

// ================= Cấu hình từ xa + cập nhật firmware =================

uint32_t measureIntervalMin = MEASURE_INTERVAL_MIN;
String pendingFirmware;  // version máy chủ báo có bản mới

void loadRemoteConfig() {
    File f = LittleFS.open(CONFIG_FILE, "r");
    if (!f) return;
    JsonDocument doc;
    if (!deserializeJson(doc, f) && doc["measure_interval_min"].is<uint32_t>()) measureIntervalMin = doc["measure_interval_min"];
    f.close();
}

// Đọc "config" + "firmware_update" trong phản hồi của máy chủ
void applyServerResponse(JsonDocument &response) {
    uint32_t interval = response["config"]["measure_interval_min"] | 0;
    if (interval >= 5 && interval <= 240 && interval != measureIntervalMin) {
        measureIntervalMin = interval;
        File f = LittleFS.open(CONFIG_FILE, "w");
        if (f) {
            JsonDocument doc;
            doc["measure_interval_min"] = interval;
            serializeJson(doc, f);
            f.close();
        }
        Serial.printf("Máy chủ đổi chu kỳ đo: %lu phút\n", (unsigned long)interval);
    }
    const char *version = response["firmware_update"]["version"] | "";
    if (strlen(version) > 0 && strcmp(version, FIRMWARE_VERSION) != 0) pendingFirmware = version;
}

// Tải bản firmware mới: thư viện HTTPUpdate kiểm MD5 (header x-MD5) trước khi ghi, xong thì khởi động lại
void runFirmwareUpdate() {
#if OTA_ENABLED
    if (pendingFirmware.isEmpty() || WiFi.status() != WL_CONNECTED) return;
    String url = String(API_BASE) + "/device/firmware";
    NetworkClient *net = netFor(url.startsWith("https://"));
    if (net == nullptr) return;
    Serial.printf("Cập nhật firmware %s -> %s\n", FIRMWARE_VERSION, pendingFirmware.c_str());
    httpUpdate.rebootOnUpdate(true);
    httpUpdate.update(*net, url, FIRMWARE_VERSION, [](HTTPClient *http) {
        http->addHeader("Authorization", String("Bearer ") + DEVICE_KEY);
    });
    // Tới đây là chưa cập nhật được (thành công thì đã khởi động lại); lần sau thử lại
    Serial.printf("Cập nhật lỗi: %s\n", httpUpdate.getLastErrorString().c_str());
    pendingFirmware = "";
#else
    if (!pendingFirmware.isEmpty()) Serial.println("Có firmware mới nhưng bản này không hỗ trợ cập nhật qua mạng (build -e esp32dev-ota)");
    pendingFirmware = "";
#endif
}

// ================= Đồng hồ =================

time_t nowEpoch() {
    time_t t = time(nullptr);
    return t >= VALID_EPOCH ? t : 0;
}

void setClock(time_t epoch) {
    timeval tv = {epoch, 0};
    settimeofday(&tv, nullptr);
    if (rtcOk) {
        rtc.adjust(DateTime((uint32_t)epoch));
    }
}

void initClock() {
#if USE_RTC
    rtcOk = rtc.begin();
    // Đồng hồ hệ thống vẫn chạy khi ngủ sâu; chỉ lấy lại từ DS3231 khi vừa cấp điện lại
    if (rtcOk && nowEpoch() == 0 && !rtc.lostPower()) {
        timeval tv = {(time_t)rtc.now().unixtime(), 0};
        settimeofday(&tv, nullptr);
    }
#endif
}

void syncClockNtp() {
    configTime(0, 0, "pool.ntp.org", "time.google.com");
    for (int i = 0; i < 50 && time(nullptr) < VALID_EPOCH; i++) {
        delay(100);
    }
    if (nowEpoch() != 0) {
        setClock(nowEpoch());
    }
}

// ================= Hàng đợi trên flash =================

size_t readPos() {
    File f = LittleFS.open(POS_FILE, "r");
    if (!f) return 0;
    size_t pos = f.parseInt();
    f.close();
    return pos;
}

void writePos(size_t pos) {
    File f = LittleFS.open(POS_FILE, "w");
    f.print(pos);
    f.close();
}

size_t queueSize() {
    File f = LittleFS.open(QUEUE_FILE, "r");
    if (!f) return 0;
    size_t size = f.size();
    f.close();
    return size;
}

void appendReading(time_t t, const char *metric, float value) {
    File f = LittleFS.open(QUEUE_FILE, FILE_APPEND);
    if (!f) return;
    // Chưa có giờ (mất điện, không có DS3231, chưa từng có mạng): để trống, máy chủ lấy giờ nhận
    if (t) {
        f.printf("%lu,%s,%.3f\n", (unsigned long)t, metric, value);
    } else {
        f.printf(",%s,%.3f\n", metric, value);
    }
    f.close();
    Serial.printf("  %s = %.3f\n", metric, value);

    if (smsSnapshot.isEmpty()) smsSnapshot = "@" + (t ? String((unsigned long)t) : String(""));
    String number = String(value, 2);
    while (number.endsWith("0")) number.remove(number.length() - 1);
    if (number.endsWith(".")) number.remove(number.length() - 1);
    smsSnapshot += String(";") + metric + "=" + number;
}

// Bỏ phần đã gửi; flash sắp đầy thì bỏ bớt dữ liệu cũ nhất
void compactQueue() {
    size_t size = queueSize();
    size_t pos = readPos();
    if (size == 0) return;
    if (pos >= size) {
        LittleFS.remove(QUEUE_FILE);
        LittleFS.remove(POS_FILE);
        return;
    }
    if (size <= MAX_QUEUE_BYTES && pos < 64 * 1024) return;

    size_t start = max(pos, size > MAX_QUEUE_BYTES ? size - MAX_QUEUE_BYTES * 3 / 4 : (size_t)0);
    File in = LittleFS.open(QUEUE_FILE, "r");
    File out = LittleFS.open(TMP_FILE, "w");
    in.seek(start);
    if (start > pos) in.readStringUntil('\n');  // bắt đầu từ đầu 1 dòng
    uint8_t buf[512];
    size_t n;
    while ((n = in.read(buf, sizeof(buf))) > 0) out.write(buf, n);
    in.close();
    out.close();
    LittleFS.remove(QUEUE_FILE);
    LittleFS.rename(TMP_FILE, QUEUE_FILE);
    writePos(0);
}

// ================= Cảm biến =================

void preTransmission() {
    if (RS485_DE_RE >= 0) digitalWrite(RS485_DE_RE, HIGH);
}

void postTransmission() {
    if (RS485_DE_RE >= 0) digitalWrite(RS485_DE_RE, LOW);
}

void readModbus(time_t t) {
    if (RS485_DE_RE >= 0) {
        pinMode(RS485_DE_RE, OUTPUT);
        postTransmission();
    }
    Serial2.begin(RS485_BAUD, SERIAL_8N1, RS485_RX, RS485_TX);
    delay(1500);  // cảm biến đất cần thời gian khởi động sau khi cấp nguồn

    for (const ModbusPoint &point : MODBUS_POINTS) {
        modbus.begin(point.slave, Serial2);
        modbus.preTransmission(preTransmission);
        modbus.postTransmission(postTransmission);

        uint8_t result = modbus.readHoldingRegisters(point.reg, 1);
        if (result == modbus.ku8MBSuccess) {
            appendReading(t, point.metric, (int16_t)modbus.getResponseBuffer(0) * point.scale);
        } else {
            Serial.printf("  %s: lỗi Modbus 0x%02X (slave %u, thanh ghi 0x%04X)\n", point.metric, result, point.slave, point.reg);
        }
        delay(50);
    }
    Serial2.end();
}

#if USE_ULTRASONIC
float readDistanceCm() {
    pinMode(ULTRASONIC_TRIG, OUTPUT);
    pinMode(ULTRASONIC_ECHO, INPUT);
    float samples[5];
    int count = 0;
    for (int i = 0; i < 5; i++) {
        digitalWrite(ULTRASONIC_TRIG, LOW);
        delayMicroseconds(5);
        digitalWrite(ULTRASONIC_TRIG, HIGH);
        delayMicroseconds(20);
        digitalWrite(ULTRASONIC_TRIG, LOW);
        unsigned long duration = pulseIn(ULTRASONIC_ECHO, HIGH, 30000);
        if (duration > 0) samples[count++] = duration * 0.0343f / 2;
        delay(60);
    }
    if (count == 0) return NAN;
    // Trung vị để bỏ tiếng vọng nhiễu
    std::sort(samples, samples + count);
    return samples[count / 2];
}
#endif

void measure() {
    time_t t = nowEpoch();
    Serial.printf("Đo lúc %lu\n", (unsigned long)t);

    readModbus(t);

#if USE_ULTRASONIC
    float distance = readDistanceCm();
    if (!isnan(distance)) appendReading(t, "water_level", MOUNT_HEIGHT_CM - distance);
#endif

#if BATTERY_ADC_PIN
    float volts = analogReadMilliVolts(BATTERY_ADC_PIN) * 2 / 1000.0f;
    float percent = (volts - BATTERY_EMPTY_V) / (BATTERY_FULL_V - BATTERY_EMPTY_V) * 100;
    appendReading(t, "battery", constrain(percent, 0.0f, 100.0f));
#endif
}

// ================= Gửi lên máy chủ =================

bool connectWifi() {
    if (strlen(WIFI_SSID) == 0) return false;
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    unsigned long deadline = millis() + WIFI_CONNECT_TIMEOUT_MS;
    while (WiFi.status() != WL_CONNECTED && millis() < deadline) delay(200);
    Serial.println(WiFi.status() == WL_CONNECTED ? "Đã có WiFi" : "Không có WiFi, giữ dữ liệu trong hàng đợi");
    return WiFi.status() == WL_CONNECTED;
}

// Đọc tối đa UPLOAD_BATCH dòng từ vị trí pos, trả về JSON và vị trí sau lô
String buildBatch(File &f, size_t &next) {
    JsonDocument doc;
    doc["firmware"] = FIRMWARE_VERSION;
#if USE_MQTT
    doc["key"] = DEVICE_KEY;
#endif
    JsonArray readings = doc["readings"].to<JsonArray>();

    for (int i = 0; i < UPLOAD_BATCH && f.available(); i++) {
        String line = f.readStringUntil('\n');
        int c1 = line.indexOf(',');
        int c2 = line.indexOf(',', c1 + 1);
        if (c1 < 0 || c2 < 0) continue;

        JsonObject row = readings.add<JsonObject>();
        String t = line.substring(0, c1);
        if (t.length() > 0) row["t"] = (uint32_t)t.toInt();
        row["metric"] = line.substring(c1 + 1, c2);
        row["value"] = line.substring(c2 + 1).toFloat();
    }
    next = f.position();

    String body;
    serializeJson(doc, body);
    return body;
}

#if USE_MQTT
PubSubClient mqtt;

bool sendBatch(const String &body) {
    if (!mqtt.connected()) {
        NetworkClient *net = netFor(MQTT_TLS);
        if (net == nullptr) return false;
        mqtt.setClient(*net);
        mqtt.setServer(MQTT_HOST, MQTT_PORT);
        mqtt.setBufferSize(24 * 1024);
        bool connected = strlen(MQTT_USERNAME) > 0 ? mqtt.connect(DEVICE_UID, MQTT_USERNAME, MQTT_PASSWORD) : mqtt.connect(DEVICE_UID);
        if (!connected) return false;
    }
    String topic = String("nhanong/") + DEVICE_UID + "/up";
    return mqtt.publish(topic.c_str(), body.c_str());
}
#else
bool sendBatch(const String &body) {
    HTTPClient http;
    if (!beginHttp(http, String(API_BASE) + "/ingest")) return false;
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(15000);
    int status = http.POST(body);

    if (status == 200) {
        JsonDocument response;
        if (!deserializeJson(response, http.getString())) {
            Serial.printf("  nhận %d, trùng %d, loại %d\n", response["accepted"].as<int>(), response["duplicates"].as<int>(), response["rejected"].size());
            // Không có NTP thì lấy giờ máy chủ
            if (nowEpoch() == 0 && response["server_time"].is<uint32_t>()) setClock(response["server_time"].as<uint32_t>());
            applyServerResponse(response);
        }
    } else {
        Serial.printf("  gửi lỗi HTTP %d\n", status);
    }
    http.end();
    // 422 (lô sai định dạng) cũng bỏ qua để không kẹt hàng đợi mãi
    return status == 200 || status == 422;
}
#endif

void flushQueue() {
    File f = LittleFS.open(QUEUE_FILE, "r");
    if (!f) return;
    size_t pos = readPos();
    f.seek(pos);

    // Tối đa 50 lô mỗi lần thức (10.000 số đo) để không tốn pin quá lâu
    for (int batch = 0; batch < 50 && f.available(); batch++) {
        size_t next;
        String body = buildBatch(f, next);
        if (!sendBatch(body)) break;
        pos = next;
        writePos(pos);
    }
    f.close();
    compactQueue();
}

// ================= SMS qua SIM800L (khi không có WiFi) =================

#if USE_SMS
String hmacString(const String &text);

// Gửi lệnh AT (nullptr = chỉ chờ), trả về những gì module trả lời trong thời gian chờ hoặc tới khi thấy expect
String simCommand(const char *command, const char *expect, uint32_t timeoutMs) {
    while (Serial1.available()) Serial1.read();
    if (command) Serial1.println(command);
    String response;
    unsigned long deadline = millis() + timeoutMs;
    while (millis() < deadline) {
        while (Serial1.available()) response += (char)Serial1.read();
        if (response.indexOf(expect) >= 0) break;
        delay(10);
    }
    return response;
}

bool sendSms(const String &text) {
    if (simCommand("AT+CMGS=\"" SMS_GATEWAY_NUMBER "\"", ">", 5000).indexOf('>') < 0) return false;
    Serial1.print(text);
    Serial1.write(26);  // Ctrl+Z: gửi
    return simCommand(nullptr, "+CMGS", 30000).indexOf("+CMGS") >= 0;
}

// Mỗi tin: "<uid> <16 ký tự đầu chữ ký> @<t>;metric=value;..." tối đa 160 ký tự; nhiều chỉ số thì tách nhiều tin
void sendSmsSnapshot() {
    time_t now = nowEpoch();
    if (smsSnapshot.isEmpty() || (lastSmsAt != 0 && now != 0 && now - lastSmsAt < SMS_INTERVAL_HOURS * 3600)) return;

    Serial1.begin(9600, SERIAL_8N1, SIM_RX, SIM_TX);
    bool ready = false;
    for (int i = 0; i < 20 && !ready; i++) ready = simCommand("AT", "OK", 1000).indexOf("OK") >= 0;
    if (!ready) {
        Serial.println("SIM800L không trả lời");
        return;
    }
    simCommand("AT+CMGF=1", "OK", 2000);  // chế độ văn bản
    bool registered = false;
    for (int i = 0; i < 30 && !registered; i++) {
        String response = simCommand("AT+CREG?", "OK", 1000);
        registered = response.indexOf(",1") >= 0 || response.indexOf(",5") >= 0;  // mạng nhà / chuyển vùng
        if (!registered) delay(1000);
    }
    if (!registered) {
        Serial.println("SIM chưa có sóng");
        return;
    }

    String header = String(DEVICE_UID) + " ";
    int split = smsSnapshot.indexOf(';');
    String time = smsSnapshot.substring(0, split);  // "@<t>"
    String rest = smsSnapshot.substring(split + 1) + ";";
    bool allSent = true;
    while (rest.length() > 0) {
        String payload = time;
        int end;
        // 160 ký tự - uid - chữ ký 16 ký tự - 2 khoảng trắng
        while ((end = rest.indexOf(';')) >= 0 && header.length() + 17 + payload.length() + end + 1 <= 160) {
            payload += ";" + rest.substring(0, end);
            rest = rest.substring(end + 1);
        }
        if (payload == time) break;  // 1 chỉ số quá dài
        String text = header + hmacString(payload).substring(0, 16) + " " + payload;
        Serial.printf("SMS: %s\n", text.c_str());
        allSent = sendSms(text) && allSent;
    }
    if (allSent) lastSmsAt = now;
    Serial1.end();
}
#endif

// ================= Điện thoại tải dữ liệu (ruộng không có mạng) =================

WebServer server(80);

// Chữ ký HMAC-SHA256 bằng khóa thiết bị (máy chủ kiểm bằng Device::sign)
struct Hmac {
    mbedtls_md_context_t ctx;

    Hmac() {
        mbedtls_md_init(&ctx);
        mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), 1);
        mbedtls_md_hmac_starts(&ctx, (const unsigned char *)DEVICE_KEY, strlen(DEVICE_KEY));
    }

    void update(const uint8_t *data, size_t length) { mbedtls_md_hmac_update(&ctx, data, length); }

    String hex() {
        uint8_t out[32];
        mbedtls_md_hmac_finish(&ctx, out);
        mbedtls_md_free(&ctx);
        char hex[65];
        for (int i = 0; i < 32; i++) sprintf(hex + i * 2, "%02x", out[i]);
        return String(hex);
    }
};

String hmacQueue(size_t from) {
    Hmac hmac;
    File f = LittleFS.open(QUEUE_FILE, "r");
    if (f) {
        f.seek(from);
        uint8_t buf[512];
        size_t n;
        while ((n = f.read(buf, sizeof(buf))) > 0) hmac.update(buf, n);
        f.close();
    }
    return hmac.hex();
}

String hmacString(const String &text) {
    Hmac hmac;
    hmac.update((const uint8_t *)text.c_str(), text.length());
    return hmac.hex();
}

void handleIndex() {
    size_t pending = queueSize() - min(readPos(), queueSize());
    String html =
        "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
        "<title>Nhà Nông IoT</title><body style='font-family:sans-serif;padding:16px;max-width:480px;margin:auto'>"
        "<h2>Thiết bị " DEVICE_UID "</h2>"
        "<p>Dữ liệu chưa gửi: <b>" + String(pending / 1024.0, 1) + " KB</b></p>"
        "<p><a href='/data.csv' style='display:block;padding:14px;background:#059669;color:#fff;text-align:center;border-radius:8px;text-decoration:none'>Tải file dữ liệu</a></p>"
        "<p>Về nơi có mạng, mở ứng dụng Nhà Nông và gửi file này lên (hoặc gửi tới " API_BASE "/ingest/upload). "
        "Gửi nhiều lần cũng không bị trùng.</p>"
        "<p style='color:#666'>Đồng hồ thiết bị: " + String((unsigned long)nowEpoch()) + "</p>"
        "<form method=post action=/time><input type=hidden name=t id=t><button style='padding:10px;width:100%'>Chỉnh giờ theo điện thoại</button></form>"
        "<script>document.getElementById('t').value=Math.floor(Date.now()/1000)</script>";
    server.send(200, "text/html; charset=utf-8", html);
}

void handleData() {
    size_t pos = min(readPos(), queueSize());
    String header = "#nhanong uid=" DEVICE_UID " sig=" + hmacQueue(pos) + "\n";

    server.sendHeader("Content-Disposition", "attachment; filename=nhanong-" DEVICE_UID ".csv");
    server.setContentLength(header.length() + queueSize() - pos);
    server.send(200, "text/csv", "");
    server.sendContent(header);

    File f = LittleFS.open(QUEUE_FILE, "r");
    if (f) {
        f.seek(pos);
        uint8_t buf[1024];
        size_t n;
        while ((n = f.read(buf, sizeof(buf))) > 0) server.client().write(buf, n);
        f.close();
    }
}

// Điện thoại có giờ chuẩn: chỉnh đồng hồ thiết bị khi chưa từng có mạng
void handleTime() {
    time_t t = server.arg("t").toInt();
    if (t >= VALID_EPOCH) setClock(t);
    server.sendHeader("Location", "/");
    server.send(303);
}

void runPortal() {
    String ssid = String("NHANONG-") + DEVICE_UID;
    WiFi.mode(WIFI_AP);
    WiFi.softAP(ssid.c_str(), PORTAL_PASSWORD);
    Serial.printf("Phát WiFi %s, mở http://%s\n", ssid.c_str(), WiFi.softAPIP().toString().c_str());

    server.on("/", HTTP_GET, handleIndex);
    server.on("/data.csv", HTTP_GET, handleData);
    server.on("/time", HTTP_POST, handleTime);
    server.begin();

    unsigned long deadline = millis() + PORTAL_MINUTES * 60000UL;
    while (millis() < deadline) {
        server.handleClient();
        delay(2);
    }
    server.stop();
}

// ================= Mạch điều khiển relay (CONTROLLER_MODE 1) =================

#if CONTROLLER_MODE
static const size_t RELAY_COUNT = sizeof(RELAY_PINS) / sizeof(RELAY_PINS[0]);
bool relayOn[RELAY_COUNT];
unsigned long relayOffAt[RELAY_COUNT];  // millis() lúc tự tắt; 0 = không hẹn
uint32_t doneIds[16];                   // lệnh đã làm (máy chủ gửi lại khi chưa nhận được báo cáo)
size_t doneNext = 0;
unsigned long pollMs = 10000;
unsigned long lastPoll = 0;
unsigned long lastMeasure = 0;

void setRelay(size_t index, bool on, uint32_t minutes) {
    relayOn[index] = on;
    relayOffAt[index] = on ? millis() + minutes * 60000UL : 0;
    digitalWrite(RELAY_PINS[index], (on != (bool)RELAY_ACTIVE_LOW) ? HIGH : LOW);
    Serial.printf("Kênh %u: %s%s\n", (unsigned)(index + 1), on ? "BẬT" : "TẮT", on ? (String(" ") + minutes + " phút").c_str() : "");
}

// "1:1,2:0" gửi kèm mỗi lần hỏi lệnh để máy chủ biết trạng thái thật
String relayStates() {
    String states;
    for (size_t i = 0; i < RELAY_COUNT; i++) {
        if (i) states += ",";
        states += String(i + 1) + ":" + (relayOn[i] ? "1" : "0");
    }
    return states;
}

bool alreadyDone(uint32_t id) {
    for (uint32_t done : doneIds) {
        if (done == id) return true;
    }
    return false;
}

void ackCommand(uint32_t id, bool ok, const char *message) {
    HTTPClient http;
    if (!beginHttp(http, String(API_BASE) + "/device/commands/" + id + "/ack")) return;
    http.addHeader("Content-Type", "application/json");
    JsonDocument doc;
    doc["ok"] = ok;
    if (message) doc["message"] = message;
    doc["states"] = relayStates();
    String body;
    serializeJson(doc, body);
    http.POST(body);
    http.end();
}

void pollCommands() {
    HTTPClient http;
    if (!beginHttp(http, String(API_BASE) + "/device/commands?states=" + relayStates())) return;
    http.setTimeout(10000);
    int status = http.GET();
    if (status != 200) {
        Serial.printf("Hỏi lệnh lỗi HTTP %d\n", status);
        http.end();
        return;
    }

    JsonDocument response;
    DeserializationError error = deserializeJson(response, http.getString());
    http.end();
    if (error) return;

    if (response["poll_seconds"].is<uint32_t>()) pollMs = max(3UL, (unsigned long)response["poll_seconds"].as<uint32_t>()) * 1000UL;
    if (nowEpoch() == 0 && response["server_time"].is<uint32_t>()) setClock(response["server_time"].as<uint32_t>());
    applyServerResponse(response);

    for (JsonObject command : response["commands"].as<JsonArray>()) {
        uint32_t id = command["id"];
        uint32_t channel = command["channel"];
        bool on = strcmp(command["action"] | "", "on") == 0;
        uint32_t minutes = command["minutes"] | 0;

        if (alreadyDone(id)) {
            ackCommand(id, true, nullptr);  // lần báo trước bị mất: báo lại
            continue;
        }
        if (channel < 1 || channel > RELAY_COUNT) {
            ackCommand(id, false, "Mạch không có kênh relay này");
            continue;
        }
        setRelay(channel - 1, on, minutes);
        doneIds[doneNext++ % 16] = id;
        ackCommand(id, true, nullptr);
    }
}

void controllerSetup() {
    for (size_t i = 0; i < RELAY_COUNT; i++) {
        pinMode(RELAY_PINS[i], OUTPUT);
        setRelay(i, false, 0);  // khởi động / mất điện có lại: luôn tắt hết, chờ lệnh mới
    }
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

void controllerLoop() {
    // Hẹn giờ tự tắt chạy cả khi mất WiFi: máy bơm không chạy quá số phút đã ra lệnh
    for (size_t i = 0; i < RELAY_COUNT; i++) {
        if (relayOn[i] && relayOffAt[i] != 0 && (long)(millis() - relayOffAt[i]) >= 0) setRelay(i, false, 0);
    }

    bool online = WiFi.status() == WL_CONNECTED;
    if (online && millis() - lastPoll >= pollMs) {
        lastPoll = millis();
        if (nowEpoch() == 0) syncClockNtp();
        pollCommands();
    }
    if (lastMeasure == 0 || millis() - lastMeasure >= measureIntervalMin * 60000UL) {
        lastMeasure = millis();
        measure();
        compactQueue();
        if (online) flushQueue();
    }
    // Chỉ cập nhật khi không máy nào đang chạy (khởi động lại thì relay tắt hết)
    bool anyOn = false;
    for (size_t i = 0; i < RELAY_COUNT; i++) anyOn = anyOn || relayOn[i];
    if (online && !anyOn) runFirmwareUpdate();
    delay(200);
}
#endif

// ================= Vòng đời =================

void setup() {
    Serial.begin(115200);
    LittleFS.begin(true);
    pinMode(PORTAL_BUTTON_PIN, INPUT_PULLUP);
    initClock();
    loadRemoteConfig();

#if CONTROLLER_MODE
    controllerSetup();
    return;  // mạch điều khiển chạy liên tục trong loop(), không ngủ sâu
#endif

    esp_sleep_wakeup_cause_t cause = esp_sleep_get_wakeup_cause();
    bool buttonWake = cause == ESP_SLEEP_WAKEUP_EXT0 || digitalRead(PORTAL_BUTTON_PIN) == LOW;
    time_t now = nowEpoch();

    // Bấm nút giữa 2 lần đo thì không đo lại
    if (!buttonWake || nextMeasureAt == 0 || (now != 0 && now >= nextMeasureAt)) {
        measure();
        nextMeasureAt = nowEpoch() ? nowEpoch() + measureIntervalMin * 60 : 0;
    }
    compactQueue();

    if (buttonWake) {
        runPortal();
    } else if (connectWifi()) {
        syncClockNtp();
        flushQueue();
        runFirmwareUpdate();
    } else {
#if USE_SMS
        sendSmsSnapshot();
#endif
    }

    WiFi.disconnect(true);
    WiFi.mode(WIFI_OFF);

    uint64_t sleepSeconds = measureIntervalMin * 60;
    now = nowEpoch();
    if (now != 0 && nextMeasureAt > now) sleepSeconds = nextMeasureAt - now;
    Serial.printf("Ngủ %llu giây\n", sleepSeconds);
    Serial.flush();

    esp_sleep_enable_timer_wakeup(sleepSeconds * 1000000ULL);
    esp_sleep_enable_ext0_wakeup((gpio_num_t)PORTAL_BUTTON_PIN, 0);
    esp_deep_sleep_start();
}

void loop() {
#if CONTROLLER_MODE
    controllerLoop();
#endif
}
