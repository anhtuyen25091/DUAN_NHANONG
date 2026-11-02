<?php

use Illuminate\Support\Facades\Schedule;

// Gộp số đo theo giờ (bắt cả dữ liệu gửi bù vừa về)
Schedule::command('readings:rollup --hours=1')->everyFifteenMinutes()->withoutOverlapping();
// Dọn số đo thô cũ
Schedule::command('readings:prune')->dailyAt('03:30');
// Báo thiết bị mất kết nối / sắp hết pin
Schedule::command('devices:check-health')->everyThirtyMinutes()->withoutOverlapping();
// Mưa: kiểm tra đang mưa 15 phút / lần; lưu lượng mưa từng ngày mỗi giờ (hôm nay + hôm qua)
Schedule::command('weather:rain-watch')->everyFifteenMinutes()->withoutOverlapping();
Schedule::command('weather:sync-rain --days=2')->hourly()->withoutOverlapping();
// Lệnh bật / tắt quá hạn (mạch không nhận kịp): hủy và báo
Schedule::command('commands:expire')->everyMinute()->withoutOverlapping();
// Lịch tưới (mỗi phút) và nhắc nhiều ngày không mưa (7:00 sáng)
Schedule::command('schedules:run')->everyMinute()->withoutOverlapping();
Schedule::command('weather:dry-spell')->dailyAt('07:00')->withoutOverlapping();
// Nhắc việc làm vườn đã lên kế hoạch cho hôm nay (phun thuốc, bón phân...)
Schedule::command('farmwork:remind')->dailyAt(config('iot.farm_work.remind_at'))->withoutOverlapping();
