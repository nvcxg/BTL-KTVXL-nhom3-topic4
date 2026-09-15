# BTL KỸ THUẬT VI XỬ LÝ - NHÓM 3 - TOPIC 4

> **Đề tài:** Thiết kế mạch điện cảnh báo cháy sử dụng STM32F103C8T6, cảnh báo thông qua cuộc gọi và tin nhắn SMS.

---

## 📌 Phân Tích Đề Bài & Yêu Cầu Kỹ Thuật

### 1. Phân chia nhiệm vụ phần cứng
- **STM32F103C8T6 (Vi điều khiển chính - Core MCU):**
  - Xử lý toàn bộ ngoại vi phần cứng:
    - **Cảm biến khí Gas (MQ5):** Đọc giá trị ADC, chuyển đổi sang đơn vị tiêu chuẩn **PPM**.
    - **Màn hình LCD 20x4 (giao tiếp I2C):** Hiển thị nồng độ PPM, trạng thái module SIM, còi báo.
    - **Module SIM (SIM800L / Viettel SIM):**
      - Nếu $PPM \ge 136$: Gửi tin nhắn **SMS cảnh báo** tới số điện thoại cấu hình, đồng thời bật **Speaker/Buzzer** kêu liên tục.
      - Nếu $PPM \ge 150$: Phát **cuộc gọi thoại trực tiếp (IN CALL)** khẩn cấp.
    - **Nút nhấn Button (Tắt cảnh báo giả):** Ngắt hoặc tắt còi / LED khi có hiện tượng cảnh báo sai.
    - **Lưu ý đặc biệt của Thầy:** Không được dùng thư viện HAL trên STM32F103C8T6 (Sử dụng SPL - Standard Peripheral Library hoặc thanh ghi thuần Bare-metal).
- **ESP32 (IoT Gateway - Hỗ trợ truyền thông):**
  - Đóng vai trò là cầu nối truyền thông WiFi/IoT (chức năng mà STM32F103 không tích hợp sẵn).
  - Nhận gói tin từ STM32 qua **UART (Serial2)**.
  - Đẩy dữ liệu thời gian thực lên **Firebase Realtime Database**.
- **Giao diện Web Dashboard (Triển khai trên Vercel / Miễn phí):**
  - Giám sát thời gian thực: Nồng độ PPM, biểu đồ động, trạng thái module SIM (`IN CALL`, `NOT CALL`, `SMS SENT`), trạng thái còi, nút tắt cảnh báo.
  - **Bảo mật:** Chế độ Public Read-Only (Mọi người có thể vào xem qua link Vercel nhưng **tuyệt đối không thể chỉnh sửa hay can thiệp Database**).

---

## 📂 Cấu Trúc Thư Mục Dự Án

```
BTL-KTVXL-nhom3-topic4/
├── web/                                 # Giao diện Web Dashboard (Sẵn sàng deploy Vercel)
│   ├── index.html                       # Giao diện chính (HTML5 + TailwindCSS + FontAwesome + Chart.js)
│   ├── css/
│   │   └── style.css                    # Tùy biến giao diện & hiệu ứng động
│   ├── js/
│   │   ├── config.js                    # Cấu hình ngưỡng & Firebase URL
│   │   └── app.js                       # Logic nhận dữ liệu realtime (SSE/Polling) & vẽ biểu đồ
│   └── vercel.json                      # Cấu hình bảo mật & routing khi deploy lên Vercel
│
├── test_scripts/                        # Scripts kiểm thử hệ thống
│   ├── simulate_firebase.py             # Script Python đẩy dữ liệu giả lập trực tiếp lên Firebase để test Web
│   └── simulate_stm32_uart.py           # Script Python gửi bản tin UART giả lập từ PC sang ESP32
│
├── esp32_firmware/                      # Code nạp cho module ESP32
│   └── esp32_firebase_gateway/
│       └── esp32_firebase_gateway.ino   # Arduino sketch nhận UART STM32 và đẩy lên Firebase
│
├── database.rules.json                  # Luật bảo mật Firebase (Chống ghi/sửa từ bên ngoài)
├── .gitignore                           # Danh sách bỏ qua khi commit Git
└── README.md                            # Tài liệu hướng dẫn chi tiết
```

---

## 🛡️ Hướng Dẫn Cấu Hình Firebase Realtime Database & Bảo Mật

### 1. Tạo Firebase Database
1. Truy cập [Firebase Console](https://console.firebase.google.com/) và đăng nhập tài khoản Google.
2. Nhấn **Create a project** (hoặc chọn project có sẵn), đặt tên (ví dụ: `btl-gas-alert`).
3. Trong menu bên trái, chọn **Build** $\rightarrow$ **Realtime Database** $\rightarrow$ Nhấn **Create Database**.
4. Chọn vị trí server (khuyến nghị: **Singapore - asia-southeast1**).
5. Sau khi tạo xong, bạn sẽ nhận được **URL Database**, có dạng:
   `https://<ten-project>-default-rtdb.asia-southeast1.firebasedatabase.app` hoặc `https://<ten-project>-default-rtdb.firebaseio.com`

### 2. Cài đặt Security Rules (Bảo mật - Chỉ cho xem, cấm sửa)
Vào tab **Rules** trong Realtime Database và dán nội dung sau vào:

```json
{
  "rules": {
    "device_data": {
      ".read": true,
      ".write": false
    },
    "history": {
      ".read": true,
      ".write": false
    },
    "logs": {
      ".read": true,
      ".write": false
    }
  }
}
```

> 🔒 **Cơ chế bảo mật:**
> - `.read: true`: Cho phép giao diện Web hiển thị số liệu tức thì cho bất kỳ ai truy cập xem trang web.
> - `.write: false`: Khóa hoàn toàn quyền sửa/xóa cơ sở dữ liệu từ client web. Người xem bên ngoài **không thể can thiệp vào dữ liệu**.
> - ESP32 hoặc Backend đẩy dữ liệu an toàn thông qua Database Secret / Token hoặc REST Endpoint.
> - **URL Firebase được cấu hình kín trong code (`web/js/config.js`) và hoàn toàn không hiển thị trên giao diện người dùng.**

---

## ⚙️ Cấu Hình Firebase URL Trong Code Web

Mở file [`web/js/config.js`](file:///c:/Users/cuong/Desktop/BTL-KTVXL-nhom3-topic4/web/js/config.js) và dán URL Firebase của bạn:

```javascript
const SYSTEM_CONFIG = {
    // 🔥 Thay link Firebase Realtime Database của bạn tại đây:
    databaseUrl: "https://your-project-default-rtdb.firebaseio.com",
    dataPath: "device_data",
    demoMode: false, // true = Chế độ chạy thử tự sinh dữ liệu test offline
    // ...
};
```

---

## 🚀 Hướng Dẫn Chạy & Kiểm Thử Giao Diện Web

### Cách 1: Mở trực tiếp trên máy tính (Local)
1. Mở file `web/index.html` trực tiếp bằng trình duyệt Chrome/Edge/Firefox.
2. Hoặc chạy máy chủ HTTP local bằng Python:
   ```bash
   cd web
   python -m http.server 3000
   ```
   Truy cập: `http://localhost:3000`
3. Web sẽ tự động kết nối đến Firebase URL bạn đã cấu hình trong `web/js/config.js`.

### Cách 2: Deploy miễn phí lên Vercel (Để lấy link nộp bài / báo cáo)
1. Đẩy mã nguồn lên GitHub:
   ```bash
   git add .
   git commit -m "feat: complete web dashboard and esp32 gateway"
   git push origin main
   ```
2. Truy cập [Vercel.com](https://vercel.com/) $\rightarrow$ **Add New Project** $\rightarrow$ Import repo `BTL-KTVXL-nhom3-topic4`.
3. Tại phần **Root Directory**, chọn thư mục `web` (hoặc để mặc định).
4. Nhấn **Deploy**. Sau 30 giây, bạn sẽ nhận được link web công khai dạng `https://your-project.vercel.app`.

---

## 🧪 Chạy Script Kiểm Thử (Test Scripts)

### 1. Test Web Dashboard bằng cách đẩy dữ liệu ảo lên Firebase
Chạy script Python để mô phỏng đầy đủ 5 kịch bản (An toàn $\rightarrow$ Vượt 136 PPM gửi SMS $\rightarrow$ Vượt 150 PPM gọi điện $\rightarrow$ Nhấn nút tắt cảnh báo giả $\rightarrow$ Trở về bình thường):

```bash
# Thay thế URL bằng URL Firebase của bạn
python test_scripts/simulate_firebase.py --url https://your-project-default-rtdb.firebaseio.com
```

### 2. Test ESP32 qua cổng USB COM máy tính (Giả lập STM32 gửi UART)
Nếu bạn đang cắm ESP32 vào máy tính qua cổng USB và muốn kiểm tra khả năng nhận UART và đẩy lên Firebase:

```bash
pip install pyserial
python test_scripts/simulate_stm32_uart.py --port COM3 --baud 115200
```

---

## 🔌 Hướng Dẫn Kết Nối Phần Cứng (STM32 & ESP32)

### Sơ đồ nối dây UART (Giao tiếp giữa STM32 và ESP32):
| Chân STM32F103C8T6 | Chân ESP32 | Chức năng |
| :--- | :--- | :--- |
| **PA9 (USART1_TX) / PA2 (USART2_TX)** | **GPIO 16 (RX2)** | STM32 gửi dữ liệu sang ESP32 |
| **PA10 (USART1_RX) / PA3 (USART2_RX)** | **GPIO 17 (TX2)** | ESP32 phản hồi (nếu cần) |
| **GND** | **GND** | **BẮT BUỘC NỐI CHUNG MASS (GND)** |

### Định dạng bản tin UART từ STM32 gửi sang ESP32:
STM32 có thể gửi 1 trong 2 định dạng bản tin sau (mỗi chu kỳ 1s hoặc khi có sự kiện):

**Định dạng 1 (Chuỗi Text phân tách):**
```text
PPM:145,STATUS:IN CALL,BUZZER:1,MUTE:0\n
```

**Định dạng 2 (JSON String):**
```json
{"ppm":145,"status":"IN CALL","buzzer":1,"mute":0,"adc":1980}\n
```

---

## 👥 Danh Sách Thành Viên Thực Hiện - Nhóm 3
- **Đề tài:** Topic 4 - Hệ thống cảnh báo cháy & khí gas thông minh sử dụng STM32F103.
- **Học phần:** Kỹ thuật vi xử lý.