<?php

namespace App\Services\Weather;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;

/**
 * Gọi Open-Meteo (miễn phí, không cần khóa). Mọi giờ trả về theo giờ Việt Nam.
 */
class OpenMeteo
{
    public const TIMEZONE = 'Asia/Ho_Chi_Minh';

    /** Số ngày quá khứ tối đa API dự báo trả về; cũ hơn thì dùng API lưu trữ */
    public const MAX_PAST_DAYS = 92;

    /**
     * @param  array<string, mixed>  $query
     * @return array<string, mixed>
     */
    public function forecast(float $lat, float $lng, array $query): array
    {
        return $this->http()->get(config('iot.weather.url'), ['latitude' => $lat, 'longitude' => $lng, 'timezone' => self::TIMEZONE] + $query)->throw()->json();
    }

    /**
     * Lượng mưa từng giờ của N ngày qua tới hết hôm nay (mưa của giờ trước mốc giờ đó).
     * Giờ cũ API có thể trả null (không có số liệu): giữ null, không coi là 0 mm.
     *
     * @return array<string, float|null> "2026-10-31T14:00" => mm
     */
    public function hourlyRain(float $lat, float $lng, int $pastDays): array
    {
        $data = $this->forecast($lat, $lng, ['hourly' => 'precipitation', 'past_days' => min($pastDays, self::MAX_PAST_DAYS), 'forecast_days' => 1]);

        return array_combine($data['hourly']['time'], array_map(fn ($v) => $v === null ? null : (float) $v, $data['hourly']['precipitation']));
    }

    /**
     * Lượng mưa từng ngày trong khoảng ngày đã qua (API lưu trữ).
     *
     * @return array<string, float|null> "2026-01-31" => mm (null: chưa có dữ liệu)
     */
    public function archiveDailyRain(float $lat, float $lng, string $from, string $to): array
    {
        $data = $this->http()->get(config('iot.weather.archive_url'), [
            'latitude' => $lat,
            'longitude' => $lng,
            'start_date' => $from,
            'end_date' => $to,
            'daily' => 'precipitation_sum',
            'timezone' => self::TIMEZONE,
        ])->throw()->json();

        return array_combine($data['daily']['time'], $data['daily']['precipitation_sum']);
    }

    /**
     * Mưa 15 phút gần nhất tại nhiều vị trí trong 1 lần gọi.
     *
     * @param  list<array{0: float, 1: float}>  $points
     * @return list<array{time: string, mm: float}> theo đúng thứ tự $points
     */
    public function currentRain(array $points): array
    {
        $data = $this->http()->get(config('iot.weather.url'), [
            'latitude' => implode(',', array_column($points, 0)),
            'longitude' => implode(',', array_column($points, 1)),
            'current' => 'precipitation',
            'timezone' => self::TIMEZONE,
        ])->throw()->json();

        // 1 vị trí trả về 1 đối tượng, nhiều vị trí trả về mảng
        $locations = array_is_list($data) ? $data : [$data];

        return array_map(fn (array $location) => ['time' => $location['current']['time'], 'mm' => (float) $location['current']['precipitation']], $locations);
    }

    private function http(): PendingRequest
    {
        return Http::acceptJson()->connectTimeout(5)->timeout(20)->retry(2, 500, throw: false);
    }
}
