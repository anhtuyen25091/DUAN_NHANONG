<?php

namespace App\Console\Commands;

use App\Models\PlotEvent;
use App\Notifications\FarmWorkNotifier;
use App\Services\FarmWork\WorkAdvisor;
use Carbon\CarbonImmutable;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Throwable;

/**
 * Sáng mỗi ngày: nhắc việc đã lên kế hoạch cho hôm nay (phun thuốc, bón phân...), kèm lưu ý thời tiết nếu có.
 */
#[Signature('farmwork:remind')]
#[Description('Nhắc việc làm vườn đã lên kế hoạch cho hôm nay')]
class RemindFarmWork extends Command
{
    public function handle(FarmWorkNotifier $notifier, WorkAdvisor $advisor): int
    {
        $today = CarbonImmutable::now('Asia/Ho_Chi_Minh');
        $events = PlotEvent::query()
            ->with('plot.farm')
            ->where('planned', true)
            ->whereNull('reminded_at')
            ->whereBetween('done_at', [$today->startOfDay(), $today->endOfDay()])
            ->get();

        foreach ($events as $event) {
            $advice = null;
            if (in_array($event->kind, [PlotEvent::SPRAY, PlotEvent::FERTILIZE], true)) {
                try {
                    $advice = $advisor->advise($event->plot, $event->kind, $event->rain_free_hours);
                } catch (Throwable $e) {
                    report($e);
                }
            }
            $notifier->planned($event, $advice);
            $event->forceFill(['reminded_at' => now()])->saveQuietly();
        }

        $this->info("Đã nhắc {$events->count()} việc.");

        return self::SUCCESS;
    }
}
