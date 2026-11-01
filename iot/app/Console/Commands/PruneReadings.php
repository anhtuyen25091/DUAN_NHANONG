<?php

namespace App\Console\Commands;

use App\Models\Reading;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('readings:prune {--days= : Giữ số đo thô N ngày (mặc định theo cấu hình iot.raw_retention_days)}')]
#[Description('Xóa số đo thô cũ (bảng gộp theo giờ vẫn giữ để xem biểu đồ dài hạn)')]
class PruneReadings extends Command
{
    public function handle(): int
    {
        $days = (int) ($this->option('days') ?: config('iot.raw_retention_days'));
        $before = now()->subDays($days);

        $deleted = 0;
        do {
            $batch = Reading::query()->where('measured_at', '<', $before)->limit(5000)->delete();
            $deleted += $batch;
        } while ($batch > 0);

        $this->info("Đã xóa {$deleted} số đo thô trước {$before->toDateString()}.");

        return self::SUCCESS;
    }
}
