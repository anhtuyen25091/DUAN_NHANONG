<?php

namespace App\Jobs;

use App\Models\Device;
use App\Services\Rain\RainAlerter;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Máy đo mưa của trang trại vừa ghi nhận mưa: cập nhật trạng thái mưa, báo chủ vườn nếu mưa vừa bắt đầu.
 */
class ObserveRainGauge implements ShouldQueue
{
    use Queueable;

    public function __construct(public int $deviceId, public float $mm, public string $measuredAt) {}

    public function handle(RainAlerter $alerter): void
    {
        $device = Device::query()->with(['farm.user.pushTokens', 'plot'])->find($this->deviceId);
        if ($device !== null) {
            $alerter->observe($device->farm, $this->mm, CarbonImmutable::parse($this->measuredAt), $device);
        }
    }
}
