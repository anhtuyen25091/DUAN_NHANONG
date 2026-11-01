<?php

namespace App\Services\Rain;

use App\Models\Farm;
use App\Services\Weather\OpenMeteo;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Lượng mưa từng ngày tại vị trí trang trại (dữ liệu thời tiết Open-Meteo), lưu vào farm_rain_daily.
 *
 * - Ngày đã qua: lấy từ API lưu trữ (đủ số liệu, kể cả các tháng trước).
 * - Hôm nay: cộng mưa các giờ đã qua từ API dự báo (không cộng phần dự báo của giờ chưa tới).
 * - Ngày API lưu trữ chưa có (trễ vài ngày): lấy từ API dự báo, chỉ khi đủ số liệu cả 24 giờ.
 * Giờ / ngày không có số liệu thì bỏ qua, không coi là 0 mm.
 */
class RainHistory
{
    /** Số ngày gần nhất lấy thêm từ API dự báo (bù phần API lưu trữ còn trễ) */
    private const RECENT_DAYS = 7;

    public function __construct(private readonly OpenMeteo $openMeteo) {}

    /**
     * @return int số ngày đã lưu
     */
    public function sync(Farm $farm, int $days): int
    {
        if (! $farm->hasLocation()) {
            return 0;
        }

        $now = CarbonImmutable::now(OpenMeteo::TIMEZONE);
        $today = $now->toDateString();
        $totals = [];

        if ($days > 1) {
            $archive = $this->openMeteo->archiveDailyRain($farm->lat, $farm->lng, $now->subDays($days - 1)->toDateString(), $now->subDay()->toDateString());
            foreach ($archive as $date => $mm) {
                if ($mm !== null) {
                    $totals[$date] = (float) $mm;
                }
            }
        }

        $hours = [];
        foreach ($this->openMeteo->hourlyRain($farm->lat, $farm->lng, min($days, self::RECENT_DAYS)) as $hour => $mm) {
            // Giờ chưa tới là dự báo, không phải mưa đã xảy ra
            if ($hour <= $now->format('Y-m-d\\TH:i')) {
                $hours[substr($hour, 0, 10)][] = $mm;
            }
        }
        foreach ($hours as $date => $values) {
            $complete = ! in_array(null, $values, true) && ($date === $today || count($values) === 24);
            if ($complete && ($date === $today || ! isset($totals[$date])) && $date >= $now->subDays($days - 1)->toDateString()) {
                $totals[$date] = array_sum($values);
            }
        }

        $rows = [];
        foreach ($totals as $date => $mm) {
            $rows[] = ['farm_id' => $farm->id, 'date' => $date, 'rain_mm' => round($mm, 1), 'updated_at' => now()];
        }
        foreach (array_chunk($rows, 500) as $chunk) {
            DB::table('farm_rain_daily')->upsert($chunk, ['farm_id', 'date'], ['rain_mm', 'updated_at']);
        }

        return count($rows);
    }
}
