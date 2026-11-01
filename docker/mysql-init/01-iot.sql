-- Database cho dự án iot/ (chỉ chạy khi volume MySQL được tạo lần đầu)
CREATE DATABASE IF NOT EXISTS nhanong_iot CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON nhanong_iot.* TO 'nhanong'@'%';
