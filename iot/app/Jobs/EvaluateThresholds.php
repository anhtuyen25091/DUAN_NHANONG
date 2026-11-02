<?php

namespace App\Jobs;

use App\Enums\AlertDirection;
use App\Models\Alert;
use App\Models\Device;
use App\Models\Reading;
use App\Models\Threshold;
use App\Notifications\AlertNotifier;
use App\Services\Control\InterlockWatcher;
use App\Services\Control\RuleEngine;
use App\Services\FarmWork\PlotWork;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * So số đo mới nhất với ngưỡng của lô (và chạy luật tự động): vượt ngưỡng thì mở cảnh báo (mỗi ngưỡng 1 cảnh báo đang mở),
 * về lại trong ngưỡng thì tự đóng.
 */
class EvaluateThresholds implements ShouldQueue
{
    use Queueable;

    /**
     * @param  array<int, array{value: float, measured_at: string}>  $latest  số đo mới nhất theo metric_id
     */
    public function __construct(public int $deviceId, public array $latest) {}

    public function handle(AlertNotifier $notifier, RuleEngine $rules, InterlockWatcher $interlocks, PlotWork $work): void
    {
        $device = Device::query()->find($this->deviceId);
        if ($device === null) {
            return;
        }

        // Khóa an toàn (cảm biến nguồn nước có thể không thuộc lô nào)
        $interlocks->onReadings($device, $this->latest);
        if ($device->plot_id === null) {
            return;
        }

        // Luật tự động (bật quạt oxy khi DO thấp...) chạy cùng lúc xét ngưỡng
        $rules->evaluate($device, $this->latest);

        $thresholds = Threshold::query()
            ->with('metric')
            ->where('plot_id', $device->plot_id)
            ->whereIn('metric_id', array_keys($this->latest))
            ->get();
        // Vừa bón phân: EC / đạm / lân / kali tăng là bình thường
        $fertilize = $work->recentFertilize($device->plot_id);

        foreach ($thresholds as $threshold) {
            ['value' => $value, 'measured_at' => $measuredAt] = $this->latest[$threshold->metric_id];

            // Số đo gửi bù cũ hơn số đã có thì không phải tình trạng hiện tại
            $hasNewer = Reading::query()
                ->where('device_id', $device->id)
                ->where('metric_id', $threshold->metric_id)
                ->where('measured_at', '>', $measuredAt)
                ->exists();
            if ($hasNewer) {
                continue;
            }

            $direction = $threshold->check($value);
            $open = $threshold->alerts()->open()->latest('id')->first();

            if ($direction !== null && $open === null) {
                $afterFertilize = $fertilize !== null && $direction === AlertDirection::Above
                    && in_array($threshold->metric->code, config('iot.farm_work.fertilize_metrics'), true);
                $alert = $threshold->alerts()->create([
                    'device_id' => $device->id,
                    'direction' => $direction,
                    'value' => $value,
                    'measured_at' => $measuredAt,
                    'note' => $afterFertilize ? "Có thể do vừa bón {$fertilize->title} ngày {$fertilize->done_at->setTimezone('Asia/Ho_Chi_Minh')->format('d/m')}" : null,
                ]);
                // Đã báo "vừa bón phân, EC có thể tăng" lúc ghi việc: không báo đẩy lại
                if (! $afterFertilize) {
                    $notifier->opened($alert);
                }
            } elseif ($direction !== null) {
                // Vẫn vượt ngưỡng: cập nhật số đo gần nhất
                $open->update(['direction' => $direction, 'value' => $value, 'measured_at' => $measuredAt]);
            } elseif ($open instanceof Alert && $open->measured_at->lte($measuredAt)) {
                $open->update(['resolved_at' => $measuredAt]);
            }
        }
    }
}
