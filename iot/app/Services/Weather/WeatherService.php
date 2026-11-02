<?php

namespace App\Services\Weather;

use App\Enums\PlotType;
use App\Models\Farm;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;

/**
 * Dự báo 7 ngày theo vị trí trang trại (Open-Meteo), kèm vài lưu ý đơn giản cho ruộng / ao.
 * Các lưu ý chỉ là gợi ý chung; người dùng tự quyết theo thực tế.
 */
class WeatherService
{
    public function __construct(private readonly OpenMeteo $openMeteo) {}

    /** Mưa 24 giờ tới từ mức này thì nhắc */
    public const RAIN_NOTICE_MM = 10;

    public const RAIN_HEAVY_MM = 20;

    public const HOT_CELSIUS = 35;

    /** ~36 km/h: không nên phun thuốc */
    public const WINDY_MS = 10;

    /**
     * @return array{daily: list<array<string, mixed>>, next_24h: array{rain_mm: float, rain_chance: int}, hints: list<string>}
     */
    public function forecast(Farm $farm): array
    {
        $raw = $this->fetch(round((float) $farm->lat, 2), round((float) $farm->lng, 2));

        $daily = [];
        foreach ($raw['daily']['time'] as $i => $date) {
            $code = (int) $raw['daily']['weather_code'][$i];
            $daily[] = [
                'date' => $date,
                'code' => $code,
                'label' => self::describe($code)[0],
                'icon' => self::describe($code)[1],
                'temp_max' => $raw['daily']['temperature_2m_max'][$i],
                'temp_min' => $raw['daily']['temperature_2m_min'][$i],
                'rain_mm' => $raw['daily']['precipitation_sum'][$i],
                'rain_chance' => $raw['daily']['precipitation_probability_max'][$i],
                'wind_max' => $raw['daily']['wind_speed_10m_max'][$i],
            ];
        }

        // 24 giờ tới tính từ giờ hiện tại (giờ Việt Nam, cùng múi giờ với dữ liệu trả về)
        $from = CarbonImmutable::now('Asia/Ho_Chi_Minh')->startOfHour()->format('Y-m-d\TH:i');
        $rain = 0.0;
        $chance = 0;
        $count = 0;
        foreach ($raw['hourly']['time'] as $i => $time) {
            if ($time < $from || $count >= 24) {
                continue;
            }
            $rain += (float) $raw['hourly']['precipitation'][$i];
            $chance = max($chance, (int) $raw['hourly']['precipitation_probability'][$i]);
            $count++;
        }
        $next24h = ['rain_mm' => round($rain, 1), 'rain_chance' => $chance];

        return ['daily' => $daily, 'next_24h' => $next24h, 'hints' => $this->hints($farm, $daily, $next24h)];
    }

    /**
     * Dự báo từng giờ, tính từ giờ hiện tại (giờ Việt Nam): mưa, khả năng mưa, gió, nhiệt độ. Dùng để xem nên phun / bón lúc nào.
     *
     * @return list<array{time: string, rain_mm: float, rain_chance: int, wind_ms: ?float, temp: ?float}>
     */
    public function hourly(Farm $farm, int $hours = 48): array
    {
        $raw = $this->fetch(round((float) $farm->lat, 2), round((float) $farm->lng, 2));
        $from = CarbonImmutable::now('Asia/Ho_Chi_Minh')->startOfHour()->format('Y-m-d\TH:i');

        $result = [];
        foreach ($raw['hourly']['time'] as $i => $time) {
            if ($time < $from || count($result) >= $hours) {
                continue;
            }
            $result[] = [
                'time' => $time,
                'rain_mm' => (float) $raw['hourly']['precipitation'][$i],
                'rain_chance' => (int) $raw['hourly']['precipitation_probability'][$i],
                'wind_ms' => isset($raw['hourly']['wind_speed_10m'][$i]) ? (float) $raw['hourly']['wind_speed_10m'][$i] : null,
                'temp' => isset($raw['hourly']['temperature_2m'][$i]) ? (float) $raw['hourly']['temperature_2m'][$i] : null,
            ];
        }

        return $result;
    }

    /**
     * @param  list<array<string, mixed>>  $daily
     * @param  array{rain_mm: float, rain_chance: int}  $next24h
     * @return list<string>
     */
    private function hints(Farm $farm, array $daily, array $next24h): array
    {
        $types = $farm->plots->pluck('type');
        $hasPond = $types->contains(PlotType::Pond);
        $hasCrops = $types->contains(fn (PlotType $type) => $type !== PlotType::Pond);
        $rain = number_format($next24h['rain_mm'], 0, ',', '.');
        $today = $daily[0] ?? null;

        $hints = [];
        if ($hasPond && $next24h['rain_mm'] >= self::RAIN_HEAVY_MM) {
            $hints[] = "Sắp mưa lớn (khoảng {$rain} mm trong 24 giờ tới): mưa làm giảm pH và độ mặn của ao. Theo dõi số đo ao sau mưa.";
        }
        if ($hasCrops && $next24h['rain_mm'] >= self::RAIN_NOTICE_MM) {
            $hints[] = "Sắp mưa khoảng {$rain} mm trong 24 giờ tới: cân nhắc hoãn tưới, bón phân và phun thuốc.";
        }
        if ($today !== null && $today['temp_max'] >= self::HOT_CELSIUS) {
            $hints[] = 'Hôm nay nắng nóng (tới '.number_format($today['temp_max'], 0).'°C): theo dõi độ ẩm đất'.($hasPond ? ' và nhiệt độ nước ao' : '').'.';
        }
        if ($today !== null && $today['wind_max'] >= self::WINDY_MS) {
            $hints[] = 'Hôm nay gió mạnh: tránh phun thuốc.';
        }

        return $hints;
    }

    /**
     * @return array<string, mixed>
     */
    private function fetch(float $lat, float $lng): array
    {
        return Cache::remember("weather:v2:{$lat},{$lng}", now()->addMinutes(config('iot.weather.cache_minutes')), fn () => $this->openMeteo->forecast($lat, $lng, [
            'daily' => 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max',
            'hourly' => 'precipitation,precipitation_probability,wind_speed_10m,temperature_2m',
            'forecast_days' => 7,
            'wind_speed_unit' => 'ms',
        ]));
    }

    /**
     * Mã thời tiết WMO -> [mô tả, biểu tượng]
     *
     * @return array{0: string, 1: string}
     */
    public static function describe(int $code): array
    {
        return match (true) {
            $code === 0 => ['Trời quang', '☀️'],
            $code <= 2 => ['Ít mây', '🌤️'],
            $code === 3 => ['Nhiều mây', '☁️'],
            $code === 45 || $code === 48 => ['Sương mù', '🌫️'],
            $code >= 51 && $code <= 57 => ['Mưa phùn', '🌦️'],
            $code === 61 || $code === 80 => ['Mưa nhẹ', '🌦️'],
            $code === 63 || $code === 81 => ['Mưa vừa', '🌧️'],
            $code === 65 || $code === 66 || $code === 67 || $code === 82 => ['Mưa to', '🌧️'],
            $code >= 95 => ['Dông', '⛈️'],
            default => ['Có mây', '☁️'],
        };
    }
}
