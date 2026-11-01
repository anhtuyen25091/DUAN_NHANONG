<?php

namespace App\Services\Control;

use App\Models\Actuator;
use App\Models\Reading;

/**
 * Khóa an toàn: đọc số đo mới nhất của cảm biến nguồn nước. Không có số đo gần đây thì cho bật (không chặn mù).
 */
class InterlockGuard
{
    /** Số đo cũ hơn ngần này thì không dùng để chặn */
    public const MAX_AGE_HOURS = 12;

    /** Lý do chặn bật, null = cho bật */
    public function reasonToBlock(Actuator $actuator): ?string
    {
        if (! $actuator->hasInterlock()) {
            return null;
        }

        $latest = Reading::query()
            ->where('device_id', $actuator->block_device_id)
            ->where('metric_id', $actuator->block_metric_id)
            ->where('measured_at', '>=', now()->subHours(self::MAX_AGE_HOURS))
            ->latest('measured_at')
            ->first();

        return $latest !== null && $actuator->blockedBy($latest->value) ? self::describe($actuator, $latest->value) : null;
    }

    /** "Độ mặn 0,5 ‰ > 0,3 ‰ (Đo nước kênh)" */
    public static function describe(Actuator $actuator, float $value): string
    {
        $metric = $actuator->blockMetric;
        $unit = $metric?->unit ? " {$metric->unit}" : '';
        $n = fn (float $v) => rtrim(rtrim(number_format($v, 2, ',', '.'), '0'), ',');
        $sign = $actuator->block_operator === 'below' ? '<' : '>';

        return "{$metric?->name} {$n($value)}{$unit} {$sign} {$n($actuator->block_value)}{$unit} ({$actuator->blockDevice?->name})";
    }
}
