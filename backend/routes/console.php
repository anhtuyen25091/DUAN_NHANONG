<?php

use App\Models\CrawlLog;
use Illuminate\Support\Facades\Schedule;

// Báo đăng bản tin giá buổi sáng; chạy lại buổi chiều để lấy bài đăng muộn
Schedule::command('crawl:run --queue')
    ->twiceDailyAt(8, 14, 30)
    ->timezone('Asia/Ho_Chi_Minh')
    ->withoutOverlapping(30)
    ->onOneServer();

// Bù giá từ các báo dự phòng (báo Quốc tế, Công Thương, agro.gov…) cho những ngày báo chính không đăng bài.
// Chỉ quét tháng này; bài đã lấy thì bỏ qua nên chạy nhanh.
Schedule::command('crawl:backfill --recent')
    ->twiceDailyAt(9, 15, 0)
    ->timezone('Asia/Ho_Chi_Minh')
    ->withoutOverlapping(60)
    ->onOneServer();

// Sau khi thu thập xong (hàng đợi chạy từ 8:30 / 14:30)
Schedule::command('alerts:send')
    ->twiceDailyAt(9, 15, 30)
    ->timezone('Asia/Ho_Chi_Minh')
    ->withoutOverlapping(30)
    ->onOneServer();

// Điểm bán: đọc lại danh sách cấp phép của các Sở mỗi tháng (ngày 2, 3 giờ sáng, lúc vắng), điểm mới tự hiện / chờ duyệt
Schedule::command('shops:collect')
    ->monthlyOn(2, '03:00')
    ->timezone('Asia/Ho_Chi_Minh')
    ->withoutOverlapping(720)
    ->onOneServer();

// Ảnh hóa đơn không còn khoản thu chi nào dùng (khoản đã xóa / đã thay ảnh), sau 1 ngày
Schedule::command('receipts:prune')
    ->dailyAt('03:30')
    ->timezone('Asia/Ho_Chi_Minh')
    ->withoutOverlapping(60)
    ->onOneServer();

Schedule::command('model:prune', ['--model' => [CrawlLog::class]])->daily();
