<?php

namespace App\Services\Irrigation;

use App\Models\Farm;
use Illuminate\Support\Facades\DB;

/**
 * Số ngày liên tiếp không mưa (dưới 1 mm/ngày) tính tới hôm qua, theo lượng mưa từng ngày đã lưu.
 * Ngày không có số liệu thì dừng đếm (không coi là không mưa).
 */
class DrySpell
{
    public const RAINY_DAY_MM = 1.0;

    /** Đếm tối đa (đủ cho mùa khô) */
    public const LOOKBACK_DAYS = 90;

    public function days(Farm $farm): int
    {
        $rain = DB::table('farm_rain_daily')
            ->where('farm_id', $farm->id)
            ->where('date', '>=', now()->subDays(self::LOOKBACK_DAYS)->toDateString())
            ->where('date', '<', now()->toDateString())
            ->pluck('rain_mm', 'date');

        $days = 0;
        for ($date = now()->subDay(); $days < self::LOOKBACK_DAYS; $date = $date->subDay()) {
            $mm = $rain[$date->toDateString()] ?? null;
            if ($mm === null || (float) $mm >= self::RAINY_DAY_MM) {
                break;
            }
            $days++;
        }

        return $days;
    }

    /** Tổng mưa trong N ngày gần nhất (tới hôm qua) */
    public function total(Farm $farm, int $days): float
    {
        return (float) DB::table('farm_rain_daily')
            ->where('farm_id', $farm->id)
            ->whereBetween('date', [now()->subDays($days)->toDateString(), now()->subDay()->toDateString()])
            ->sum('rain_mm');
    }
}
