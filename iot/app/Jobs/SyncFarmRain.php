<?php

namespace App\Jobs;

use App\Models\Farm;
use App\Services\Rain\RainHistory;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Lấy lượng mưa N ngày qua cho 1 trang trại (khi vừa có vị trí: 1 năm).
 */
class SyncFarmRain implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $backoff = 60;

    public function __construct(public int $farmId, public int $days) {}

    public function handle(RainHistory $history): void
    {
        $farm = Farm::query()->find($this->farmId);
        if ($farm !== null) {
            $history->sync($farm, $this->days);
        }
    }
}
