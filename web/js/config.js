/**
 * =========================================================================================
 * CẤU HÌNH HỆ THỐNG & FIREBASE REALTIME DATABASE
 * =========================================================================================
 * 
 * HƯỚNG DẪN:
 * 1. Điền đường dẫn Firebase Realtime Database của bạn vào biến `databaseUrl` bên dưới.
 * 2. Khi chạy thực tế, đặt `demoMode: false`. Nếu muốn test web offline thì đặt `demoMode: true`.
 * 3. Link Firebase này được cấu hình kín trong code và KHÔNG hiển thị trên giao diện web.
 */

const SYSTEM_CONFIG = {
    // 🔥 Thay link Firebase Realtime Database của bạn tại đây:
    databaseUrl: "https://ktvxl-data-esp32-default-rtdb.asia-southeast1.firebasedatabase.app/",
    
    // Tên node lưu trữ dữ liệu thiết bị trên Firebase (mặc định: device_data)
    dataPath: "device_data",

    // Chế độ chạy thử: 
    // false = Kết nối Firebase thật
    // true  = Tự sinh dữ liệu ngẫu nhiên để test giao diện khi chưa có phần cứng/Firebase
    demoMode: false,

    // Tần suất cập nhật (mili-giây)
    updateIntervalMs: 2000,
    
    // Số điểm tối đa hiển thị trên biểu đồ
    maxChartPoints: 25,

    // Số dòng nhật ký tối đa hiển thị
    maxLogRows: 20,
    
    // Ngưỡng kích hoạt theo đề bài BTL
    thresholds: {
        warningPpm: 136, // Cảnh báo Cấp 1: Gửi tin nhắn SMS & Kêu còi
        dangerPpm: 150   // Nguy hiểm Cấp 2: Phát cuộc gọi trực tiếp (IN CALL) & Còi kêu tối đa
    }
};

window.SYSTEM_CONFIG = SYSTEM_CONFIG;
