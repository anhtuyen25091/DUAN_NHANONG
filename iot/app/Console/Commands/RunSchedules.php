<?php

namespace App\Console\Commands;

use App\Services\Irrigation\ScheduleRunner;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('schedules:run')]
#[Description('Chạy lịch tưới tới giờ (bỏ lượt khi đã mưa đủ, chặn khi nước nguồn mặn)')]
class RunSchedules extends Command
{
    public function handle(ScheduleRunner $runner): int
    {
        $result = $runner->run();
        $this->info("Bật {$result['started']} lượt, bỏ {$result['skipped']} lượt.");

        return self::SUCCESS;
    }
}
