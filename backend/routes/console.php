<?php

use App\Models\CrawlLog;
use Illuminate\Support\Facades\Schedule;

// Báo đăng bản tin giá buổi sáng; chạy lại buổi chiều để lấy bài đăng muộn
Schedule::command('crawl:run --queue')
    ->twiceDailyAt(8, 14, 30)
    ->timezone('Asia/Ho_Chi_Minh')
    ->withoutOverlapping(30)
    ->onOneServer();

// Sau khi thu thập xong (hàng đợi chạy từ 8:30 / 14:30)
Schedule::command('alerts:send')
    ->twiceDailyAt(9, 15, 30)
    ->timezone('Asia/Ho_Chi_Minh')
    ->withoutOverlapping(30)
    ->onOneServer();

Schedule::command('model:prune', ['--model' => [CrawlLog::class]])->daily();
