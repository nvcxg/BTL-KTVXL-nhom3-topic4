/*
 * =========================================================================================
 * BTL KỸ THUẬT VI XỬ LÝ - NHÓM 3 - TOPIC 4
 * Đề tài: Thiết kế mạch điện cảnh báo cháy sử dụng STM32F103C8T6, cảnh báo qua SMS & Call
 * Module: ESP32 WiFi & Firebase Gateway (Chỉ đóng vai trò cầu nối truyền nhận UART -> IoT)
 * =========================================================================================
 * 
 * SƠ ĐỒ KẾT NỐI UART VỚI STM32F103C8T6:
 * STM32 TX (e.g. PA9 / PA2)  --> ESP32 RX2 (GPIO 16)
 * STM32 RX (e.g. PA10 / PA3) <-- ESP32 TX2 (GPIO 17)
 * STM32 GND                  --- ESP32 GND (BẮT BUỘC NỐI CHUNG MASS GND)
 * 
 * LƯU Ý: ESP32 chỉ làm nhiệm vụ nhận dữ liệu UART từ STM32 và đẩy lên Firebase.
 * Mọi xử lý ngoại vi (MQ5, LCD20x4 I2C, SIM800L, Còi báo, Button) đều do STM32F103 đảm nhiệm.
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h> // Cài đặt qua Arduino Library Manager: "ArduinoJson by Benoit Blanchon" (v6 or v7)

// =====================================================================
// CẤU HÌNH WIFI & FIREBASE
// =====================================================================
const char* WIFI_SSID     = "YOUR_WIFI_SSID";         // Tên WiFi
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";     // Mật khẩu WiFi

// Firebase Realtime Database URL (không có dấu / ở cuối)
// Ví dụ: "https://btl-nhom3-gas-alert-default-rtdb.firebaseio.com"
const char* FIREBASE_HOST = "https://btl-nhom3-gas-alert-default-rtdb.firebaseio.com";
const char* DATA_PATH     = "/device_data.json";

// Database Secret (Nếu Rules Firebase để .write: false nhưng cho phép Secret, điền vào đây. Nếu không cần thì để trống "")
const char* FIREBASE_SECRET = ""; 

// Cấu hình UART giao tiếp với STM32
#define STM32_RX_PIN 16 // ESP32 RX2 nối STM32 TX
#define STM32_TX_PIN 17 // ESP32 TX2 nối STM32 RX
#define UART_BAUD    9600

HardwareSerial STM32Serial(2); // Dùng UART2 (Serial2) của ESP32

// Biến lưu trữ dữ liệu cảm biến
struct SensorData {
    int ppm = 0;
    String status = "NOT CALL";
    int buzzer = 0;
    int mute = 0;
    int adc = 0;
    String phone = "0987654321";
    unsigned long lastReceivedTime = 0;
    bool hasNewData = false;
} currentData;

unsigned long lastUploadTime = 0;
const unsigned long UPLOAD_INTERVAL_MS = 1500; // Đẩy dữ liệu mỗi 1.5s nếu có cập nhật

// =====================================================================
// KHỞI TẠO
// =====================================================================
void setup() {
    Serial.begin(115200); // Debug qua Serial Monitor máy tính
    delay(1000);
    Serial.println("\n\n========================================================");
    Serial.println("  ESP32 FIREBASE GATEWAY - BTL KTVXL NHOM 3 TOPIC 4");
    Serial.println("========================================================");

    // Khởi tạo UART kết nối STM32
    STM32Serial.begin(UART_BAUD, SERIAL_8N1, STM32_RX_PIN, STM32_TX_PIN);
    Serial.printf("[UART] Listening to STM32 on RX:%d, TX:%d at %d baud\n", STM32_RX_PIN, STM32_TX_PIN, UART_BAUD);

    // Kết nối WiFi
    connectToWiFi();
}

// =====================================================================
// VÒNG LẶP CHÍNH (LOOP)
// =====================================================================
void loop() {
    // 1. Đọc dữ liệu từ STM32 gửi sang qua UART
    readSTM32Data();

    // 2. Kiểm tra kết nối WiFi
    if (WiFi.status() != WL_CONNECTED) {
        connectToWiFi();
    }

    // 3. Đẩy dữ liệu lên Firebase định kỳ
    if (millis() - lastUploadTime >= UPLOAD_INTERVAL_MS) {
        lastUploadTime = millis();
        pushToFirebase();
    }
}

// =====================================================================
// HÀM KẾT NỐI WIFI
// =====================================================================
void connectToWiFi() {
    Serial.printf("[WIFI] Dang ket noi toi: %s ...\n", WIFI_SSID);
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(500);
        Serial.print(".");
        attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\n[WIFI] Ket noi thanh cong!");
        Serial.print("[WIFI] IP Address: ");
        Serial.println(WiFi.localIP());
    } else {
        Serial.println("\n[WIFI] Ket noi that bai! Se thu lai trong chu ky tiep theo.");
    }
}

// =====================================================================
// HÀM ĐỌC DỮ LIỆU TỪ STM32 QUA UART
// Hỗ trợ cả 2 định dạng bản tin:
// 1. JSON String: {"ppm":142,"status":"SMS SENT","buzzer":1,"mute":0,"adc":1940}
// 2. Simple String: PPM:142,STATUS:IN CALL,BUZZER:1,MUTE:0
// =====================================================================
void readSTM32Data() {
    while (STM32Serial.available() > 0) {
        String line = STM32Serial.readStringUntil('\n');
        line.trim();

        if (line.length() == 0) continue;

        Serial.print("[STM32 RAW] -> ");
        Serial.println(line);

        // Trường hợp 1: Dữ liệu là chuỗi JSON
        if (line.startsWith("{") && line.endsWith("}")) {
            StaticJsonDocument<256> doc;
            DeserializationError error = deserializeJson(doc, line);
            if (!error) {
                currentData.ppm = doc["ppm"] | currentData.ppm;
                currentData.status = doc["status"] | currentData.status;
                currentData.buzzer = doc["buzzer"] | currentData.buzzer;
                currentData.mute = doc["mute"] | currentData.mute;
                currentData.adc = doc["adc"] | currentData.adc;
                if (doc.containsKey("phone")) {
                    currentData.phone = doc["phone"].as<String>();
                }
                currentData.lastReceivedTime = millis();
                currentData.hasNewData = true;
                Serial.printf("[PARSED JSON] PPM=%d, Status=%s, Buzzer=%d, Mute=%d\n", 
                              currentData.ppm, currentData.status.c_str(), currentData.buzzer, currentData.mute);
            }
        } 
        // Trường hợp 2: Dữ liệu dạng text phân tách (Key:Value)
        else if (line.indexOf("PPM:") >= 0) {
            parseKeyValueString(line);
            currentData.lastReceivedTime = millis();
            currentData.hasNewData = true;
        }
    }
}

void parseKeyValueString(String line) {
    // Ví dụ: PPM:145,STATUS:IN CALL,BUZZER:1,MUTE:0
    int ppmIdx = line.indexOf("PPM:");
    if (ppmIdx >= 0) {
        int comma = line.indexOf(',', ppmIdx);
        String val = (comma > 0) ? line.substring(ppmIdx + 4, comma) : line.substring(ppmIdx + 4);
        currentData.ppm = val.toInt();
    }

    int statIdx = line.indexOf("STATUS:");
    if (statIdx >= 0) {
        int comma = line.indexOf(',', statIdx);
        currentData.status = (comma > 0) ? line.substring(statIdx + 7, comma) : line.substring(statIdx + 7);
    }

    int buzzIdx = line.indexOf("BUZZER:");
    if (buzzIdx >= 0) {
        int comma = line.indexOf(',', buzzIdx);
        String val = (comma > 0) ? line.substring(buzzIdx + 7, comma) : line.substring(buzzIdx + 7);
        currentData.buzzer = val.toInt();
    }

    int muteIdx = line.indexOf("MUTE:");
    if (muteIdx >= 0) {
        int comma = line.indexOf(',', muteIdx);
        String val = (comma > 0) ? line.substring(muteIdx + 5, comma) : line.substring(muteIdx + 5);
        currentData.mute = val.toInt();
    }
    
    Serial.printf("[PARSED TEXT] PPM=%d, Status=%s, Buzzer=%d, Mute=%d\n", 
                  currentData.ppm, currentData.status.c_str(), currentData.buzzer, currentData.mute);
}

// =====================================================================
// HÀM ĐẨY DỮ LIỆU LÊN FIREBASE REALTIME DATABASE (REST API HTTPS)
// =====================================================================
void pushToFirebase() {
    if (WiFi.status() != WL_CONNECTED) return;

    WiFiClientSecure client;
    client.setInsecure(); // Bỏ qua xác thực SSL certificate cho gọn nhẹ và ổn định trên ESP32

    HTTPClient https;
    String fullUrl = String(FIREBASE_HOST) + String(DATA_PATH);
    if (strlen(FIREBASE_SECRET) > 0) {
        fullUrl += "?auth=" + String(FIREBASE_SECRET);
    }

    if (https.begin(client, fullUrl)) {
        https.addHeader("Content-Type", "application/json");

        // Tạo JSON payload
        StaticJsonDocument<256> doc;
        doc["ppm"] = currentData.ppm;
        doc["status"] = currentData.status;
        doc["buzzer"] = currentData.buzzer;
        doc["mute"] = currentData.mute;
        doc["adc"] = currentData.adc;
        doc["phone"] = currentData.phone;
        doc["timestamp"] = millis() / 1000;
        doc["updated_at"] = "realtime";

        String requestBody;
        serializeJson(doc, requestBody);

        // Gửi PUT request để cập nhật thẳng vào node /device_data
        int httpResponseCode = https.PUT(requestBody);

        if (httpResponseCode > 0) {
            Serial.printf("[FIREBASE] PUT OK (Code %d) -> PPM: %d | Status: %s\n", 
                          httpResponseCode, currentData.ppm, currentData.status.c_str());
        } else {
            Serial.printf("[FIREBASE] PUT Loi: %s (Code %d)\n", 
                          https.errorToString(httpResponseCode).c_str(), httpResponseCode);
        }

        https.end();
    }
}

