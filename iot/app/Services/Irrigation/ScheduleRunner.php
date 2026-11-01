<?php

namespace App\Services\Irrigation;

use App\Models\ActuatorCommand;
use App\Models\ActuatorSchedule;
use App\Models\Farm;
use App\Notifications\ControlNotifier;
use App\Services\Control\BlockedCommandException;
use App\Services\Control\CommandService;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Chạy lịch tưới tới giờ (mỗi phút). Mỗi lượt: ngoài mùa thì lặng lẽ dời sang ngày sau; mưa đủ nhiều thì bỏ lượt và báo;
 * khóa an toàn chặn (nước mặn) thì báo; còn lại gửi lệnh bật. Xong cộng every_days vào ngày chạy kế tiếp.
 * Máy chủ tắt lỡ giờ: lần chạy sau vẫn tưới bù trong ngày, không dồn nhiều lượt.
 */
class ScheduleRunner
{
    public function __construct(private readonly CommandService $commands, private readonly ControlNotifier $notifier) {}

    /**
     * @return array{started: int, skipped: int}
     */
    public function run(?CarbonImmutable $now = null): array
    {
        $now ??= CarbonImmutable::now();
        $started = 0;
        $skipped = 0;

        $due = ActuatorSchedule::query()
            ->with('actuator.device.farm.user.pushTokens')
            ->where('enabled', true)
            ->whereDate('next_run_on', '<=', $now->toDateString())
            ->get()
            ->filter(fn (ActuatorSchedule $schedule) => $schedule->next_run_on->lt($now->startOfDay()) || $schedule->startsAt() <= $now->format('H:i'));

        foreach ($due as $schedule) {
            $actuator = $schedule->actuator;
            $next = $now->startOfDay()->addDays(max(1, $schedule->every_days));

            if (! $schedule->inSeason($now->month)) {
                $schedule->update(['next_run_on' => $now->startOfDay()->addDay()]);

                continue;
            }

            $rain = $this->recentRain($actuator->device->farm);
            if ($schedule->skip_rain_mm !== null && ($rain >= $schedule->skip_rain_mm || $actuator->device->farm->raining_since !== null)) {
                $this->notifier->scheduleSkipped($actuator, 'Từ hôm qua tới giờ vườn đã mưa khoảng '.number_format($rain, 1, ',', '.')." mm (ngưỡng bỏ lượt {$this->mm($schedule->skip_rain_mm)} mm). Lượt sau: {$next->format('d/m')}.");
                $schedule->update(['next_run_on' => $next]);
                $skipped++;

                continue;
            }

            try {
                $this->commands->issue($actuator, ActuatorCommand::ON, $schedule->minutes, ActuatorCommand::SOURCE_SCHEDULE, reason: "Lịch tưới {$schedule->startsAt()}");
                $started++;
            } catch (BlockedCommandException $e) {
                $this->notifier->blocked($actuator, $e->getMessage());
                $skipped++;
            }
            $schedule->forceFill(['next_run_on' => $next, 'last_run_at' => $now])->save();
        }

        return ['started' => $started, 'skipped' => $skipped];
    }

    /** Mưa hôm qua + hôm nay tới giờ tại vị trí trang trại (dữ liệu thời tiết) */
    private function recentRain(Farm $farm): float
    {
        return (float) DB::table('farm_rain_daily')
            ->where('farm_id', $farm->id)
            ->where('date', '>=', now()->subDay()->toDateString())
            ->sum('rain_mm');
    }

    private function mm(float $value): string
    {
        return rtrim(rtrim(number_format($value, 1, ',', '.'), '0'), ',');
    }
}
