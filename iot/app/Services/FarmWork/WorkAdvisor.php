<?php

namespace App\Services\FarmWork;

use App\Models\Plot;
use App\Models\PlotEvent;
use App\Models\Reading;
use App\Services\Weather\WeatherService;
use App\Support\LatestReadings;
use Carbon\CarbonImmutable;
use Throwable;

/**
 * Kiểm tra trước khi phun thuốc / bón phân: dự báo mưa, gió, nắng tại vị trí trang trại, số đo cảm biến của lô
 * (gió của trạm thời tiết, độ ẩm đất). Chỉ là gợi ý chung; nhãn thuốc và khuyến cáo của cán bộ kỹ thuật được ưu tiên.
 */
class WorkAdvisor
{
    public const OK = 'ok';

    public const INFO = 'info';

    public const CAUTION = 'caution';

    public const AVOID = 'avoid';

    private const RANK = [self::OK => 0, self::INFO => 0, self::CAUTION => 1, self::AVOID => 2];

    public function __construct(private readonly WeatherService $weather) {}

    /**
     * @param  int|null  $rainFreeHours  số giờ thuốc cần khô (theo nhãn); null = mặc định
     * @return array{kind: string, level: string, items: list<array{level: string, text: string}>, best_time: ?string}
     */
    public function advise(Plot $plot, string $kind, ?int $rainFreeHours = null): array
    {
        $farm = $plot->farm;
        $items = [];
        $hours = [];
        if ($farm->lat === null || $farm->lng === null) {
            $items[] = [self::CAUTION, 'Trang trại chưa có vị trí nên chưa xem được dự báo thời tiết. Sửa trang trại để thêm vị trí vườn.'];
        } else {
            try {
                $hours = $this->weather->hourly($farm, 48);
            } catch (Throwable $e) {
                report($e);
                $items[] = [self::CAUTION, 'Chưa lấy được dự báo thời tiết, hãy tự xem trời trước khi làm.'];
            }
        }
        $sensors = $this->sensors($plot);

        $best = null;
        if ($kind === PlotEvent::SPRAY) {
            $window = $rainFreeHours ?? (int) config('iot.farm_work.spray_rain_free_hours');
            array_push($items, ...$this->spray($farm->raining_since !== null, $hours, $window, $sensors));
            $best = $hours === [] ? null : $this->bestSprayTime($hours, $window);
        } elseif ($kind === PlotEvent::FERTILIZE) {
            array_push($items, ...$this->fertilize($farm->raining_since !== null, $hours, $sensors, $plot));
        }

        $level = self::OK;
        foreach ($items as [$itemLevel]) {
            if (self::RANK[$itemLevel] > self::RANK[$level]) {
                $level = $itemLevel;
            }
        }
        if ($items === [] || $level === self::OK) {
            $items[] = [self::OK, $kind === PlotEvent::SPRAY ? 'Thời tiết phù hợp để phun.' : 'Thời tiết phù hợp để bón phân.'];
        }
        if ($kind === PlotEvent::FERTILIZE && $level !== self::AVOID) {
            $items[] = [self::INFO, 'Bón xong nên tưới nhẹ cho phân tan, trừ khi sắp có mưa.'];
        }

        return [
            'kind' => $kind,
            'level' => $level,
            'items' => array_map(fn (array $item) => ['level' => $item[0], 'text' => $item[1]], $items),
            'best_time' => $level === self::OK ? null : $best,
        ];
    }

    /**
     * @param  list<array{time: string, rain_mm: float, rain_chance: int, wind_ms: ?float, temp: ?float}>  $hours
     * @param  array{wind_ms: ?float, soil_moisture: ?float}  $sensors
     * @return list<array{0: string, 1: string}>
     */
    private function spray(bool $raining, array $hours, int $window, array $sensors): array
    {
        $items = [];
        if ($raining) {
            $items[] = [self::AVOID, 'Vườn đang mưa: thuốc sẽ bị rửa trôi.'];
        }
        if ($hours !== []) {
            $next = array_slice($hours, 0, max(1, $window));
            $rain = array_sum(array_column($next, 'rain_mm'));
            $chance = max(array_column($next, 'rain_chance'));
            if ($rain >= 1) {
                $items[] = [self::AVOID, "Dự báo mưa khoảng {$this->number($rain)} mm trong {$window} giờ tới (thuốc cần khô {$window} giờ): thuốc dễ bị rửa trôi."];
            } elseif ($chance >= 60) {
                $items[] = [self::CAUTION, "Có khả năng mưa {$chance}% trong {$window} giờ tới."];
            }
        }

        // Gió: ưu tiên trạm thời tiết ở vườn (đo trong 1 giờ qua), không có thì dùng dự báo
        $wind = $sensors['wind_ms'] ?? ($hours[0]['wind_ms'] ?? null);
        $from = $sensors['wind_ms'] !== null ? 'trạm đo ở vườn' : 'dự báo';
        if ($wind !== null && $wind > (float) config('iot.farm_work.spray_wind_avoid_ms')) {
            $items[] = [self::AVOID, "Gió mạnh {$this->number($wind)} m/s ({$from}): thuốc bay sang chỗ khác, phí thuốc và nguy hiểm cho người phun."];
        } elseif ($wind !== null && $wind > (float) config('iot.farm_work.spray_wind_caution_ms')) {
            $items[] = [self::CAUTION, "Gió {$this->number($wind)} m/s ({$from}): phun xuôi chiều gió, tránh phun gần nhà, ao, nguồn nước."];
        }

        $temp = $hours[0]['temp'] ?? null;
        if ($temp !== null && $temp >= (float) config('iot.farm_work.spray_hot_celsius')) {
            $items[] = [self::CAUTION, "Trời nóng {$this->number($temp)}°C: nên phun sáng sớm hoặc chiều mát để thuốc không bay hơi, không cháy lá."];
        }

        return $items;
    }

    /**
     * @param  list<array{time: string, rain_mm: float, rain_chance: int, wind_ms: ?float, temp: ?float}>  $hours
     * @param  array{wind_ms: ?float, soil_moisture: ?float}  $sensors
     * @return list<array{0: string, 1: string}>
     */
    private function fertilize(bool $raining, array $hours, array $sensors, Plot $plot): array
    {
        $items = [];
        $limit = (float) config('iot.farm_work.fertilize_rain_mm');
        $rain = array_sum(array_column($hours, 'rain_mm'));
        if ($rain >= $limit) {
            $items[] = [self::CAUTION, "Dự báo mưa khoảng {$this->number($rain)} mm trong 48 giờ tới: phân dễ bị rửa trôi, cân nhắc hoãn vài ngày."];
        } elseif ($raining) {
            $items[] = [self::CAUTION, 'Vườn đang mưa: đợi tạnh, đất bớt sũng nước rồi hãy bón.'];
        }

        $moisture = $sensors['soil_moisture'];
        $min = $plot->thresholds()->whereHas('metric', fn ($query) => $query->where('code', 'soil_moisture'))->value('min');
        if ($moisture !== null && $min !== null && $moisture < (float) $min) {
            $items[] = [self::CAUTION, "Đất đang khô (độ ẩm {$this->number($moisture)}%, ngưỡng của lô ≥ {$this->number((float) $min)}%): nên tưới trước khi bón để phân không làm hại rễ."];
        }

        return $items;
    }

    /**
     * Giờ gần nhất trong 24 giờ tới (ban ngày, 5:00 - 18:00): sau đó `window` giờ không mưa, gió nhẹ, không quá nóng.
     *
     * @param  list<array{time: string, rain_mm: float, rain_chance: int, wind_ms: ?float, temp: ?float}>  $hours
     */
    private function bestSprayTime(array $hours, int $window): ?string
    {
        $windLimit = (float) config('iot.farm_work.spray_wind_caution_ms');
        $hot = (float) config('iot.farm_work.spray_hot_celsius');
        for ($i = 1; $i < min(24, count($hours)); $i++) {
            $h = $hours[$i];
            $hour = (int) substr($h['time'], 11, 2);
            if ($hour < 5 || $hour > 18 || ($h['wind_ms'] ?? 0) > $windLimit || ($h['temp'] ?? 0) >= $hot) {
                continue;
            }
            $next = array_slice($hours, $i, max(1, $window));
            if (array_sum(array_column($next, 'rain_mm')) < 0.5 && max(array_column($next, 'rain_chance')) < 60) {
                return CarbonImmutable::parse($h['time'], 'Asia/Ho_Chi_Minh')->toIso8601String();
            }
        }

        return null;
    }

    /**
     * Số đo gần đây của lô: gió (trạm thời tiết, trong 1 giờ qua), độ ẩm đất (trong 6 giờ qua).
     *
     * @return array{wind_ms: ?float, soil_moisture: ?float}
     */
    private function sensors(Plot $plot): array
    {
        $readings = LatestReadings::forDevices($plot->devices()->pluck('id')->all());
        $pick = fn (string $code, int $hours) => $readings
            ->filter(fn (Reading $r) => $r->metric->code === $code && $r->measured_at->gt(now()->subHours($hours)))
            ->avg('value');

        return ['wind_ms' => $pick('wind_speed', 1), 'soil_moisture' => $pick('soil_moisture', 6)];
    }

    private function number(float $value): string
    {
        return rtrim(rtrim(number_format($value, 1, ',', '.'), '0'), ',');
    }
}
