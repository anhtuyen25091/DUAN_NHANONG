<?php

namespace App\Services;

use App\Enums\ReadingSource;
use App\Jobs\EvaluateThresholds;
use App\Jobs\ObserveRainGauge;
use App\Models\Actuator;
use App\Models\Device;
use App\Models\Metric;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Cửa duy nhất ghi số đo vào hệ thống (HTTP, MQTT, LoRaWAN, điện thoại chuyển tiếp, SMS, giả lập).
 *
 * Mỗi số đo mang giờ đo của thiết bị nên gửi bù sau 1 ngày mất mạng vẫn nằm đúng chỗ trên biểu đồ.
 * Khóa (thiết bị, chỉ số, giờ đo) là duy nhất: gửi lại cùng lô không bị nhân đôi.
 */
class ReadingIngestor
{
    /** Cho phép đồng hồ thiết bị chạy nhanh một chút */
    private const FUTURE_TOLERANCE_SECONDS = 600;

    /**
     * Dữ liệu dạng JSON mà ESP32 gửi qua HTTP hoặc MQTT:
     * {"firmware": "1.0.0", "readings": [{"metric": "soil_ph", "value": 6.4, "t": 1730170000}, ...]}
     *
     * @param  array<string, mixed>  $payload
     */
    public function ingestPayload(Device $device, array $payload, ReadingSource $source): IngestResult
    {
        if (is_string($payload['firmware'] ?? null) && $payload['firmware'] !== $device->firmware) {
            $device->firmware = mb_substr($payload['firmware'], 0, 32);
        }

        $rows = is_array($payload['readings'] ?? null) ? array_values($payload['readings']) : [];

        return $this->ingest($device, $rows, $source);
    }

    /**
     * @param  list<mixed>  $rows  mỗi dòng: ['metric' => mã chỉ số, 'value' => số, 't' => epoch giây | chuỗi ISO | null = lúc nhận]
     */
    public function ingest(Device $device, array $rows, ReadingSource $source): IngestResult
    {
        $now = CarbonImmutable::now();
        $metrics = Metric::byCode();
        $oldest = $now->subDays(config('iot.max_backfill_days'));
        $newest = $now->addSeconds(self::FUTURE_TOLERANCE_SECONDS);

        $records = [];
        $rejected = [];
        foreach ($rows as $index => $row) {
            $metric = is_array($row) && is_string($row['metric'] ?? null) ? ($metrics[$row['metric']] ?? null) : null;
            $value = is_array($row) ? ($row['value'] ?? null) : null;
            $measuredAt = is_array($row) ? self::parseTime($row['t'] ?? null, $now) : null;

            $reason = match (true) {
                $metric === null => 'unknown_metric',
                ! is_numeric($value) || ! is_finite((float) $value) => 'invalid_value',
                ! $metric->isValid((float) $value) => 'out_of_range',
                $measuredAt === null => 'invalid_time',
                $measuredAt->lt($oldest) => 'too_old',
                $measuredAt->gt($newest) => 'future_time',
                default => null,
            };
            if ($reason !== null) {
                $rejected[] = ['index' => $index, 'reason' => $reason];

                continue;
            }

            $time = $measuredAt->format('Y-m-d H:i:s');
            // Trùng ngay trong lô thì lấy dòng sau cùng
            $records[$metric->id.'|'.$time] = [
                'device_id' => $device->id,
                'metric_id' => $metric->id,
                'value' => round((float) $value, 3),
                'measured_at' => $time,
                'received_at' => $now->format('Y-m-d H:i:s'),
                'source' => $source->value,
            ];
        }

        $inserted = 0;
        foreach (array_chunk(array_values($records), 500) as $chunk) {
            $inserted += DB::table('readings')->insertOrIgnore($chunk);
        }

        $this->touchDevice($device, $records, $metrics['battery'] ?? null, $now);
        $this->queueThresholdCheck($device, $records, $now);
        $this->queueRainCheck($device, $records, $metrics['rainfall'] ?? null, $now);

        return new IngestResult($inserted, count($records) - $inserted, $rejected);
    }

    /**
     * @param  array<string, array{metric_id: int, value: float, measured_at: string}>  $records
     */
    private function touchDevice(Device $device, array $records, ?Metric $battery, CarbonImmutable $now): void
    {
        $device->last_seen_at = $now;
        // Gửi lại được: lần mất kết nối sau sẽ báo tiếp
        $device->offline_notified_at = null;

        if ($battery !== null) {
            $latest = collect($records)->where('metric_id', $battery->id)->sortBy('measured_at')->last();
            if ($latest !== null) {
                $device->battery = (int) round($latest['value']);
                if ($device->battery >= config('iot.battery_recovered_percent')) {
                    $device->low_battery_notified_at = null;
                }
            }
        }

        $device->save();
    }

    /**
     * Chỉ xét ngưỡng với số đo mới nhất của mỗi chỉ số, và chỉ khi số đo còn "nóng":
     * dữ liệu gửi bù sau nhiều giờ mất mạng thì chỉ lưu, không báo động muộn.
     *
     * @param  array<string, array{metric_id: int, value: float, measured_at: string}>  $records
     */
    private function queueThresholdCheck(Device $device, array $records, CarbonImmutable $now): void
    {
        // Thiết bị không thuộc lô vẫn có thể là cảm biến khóa an toàn (VD đo độ mặn kênh cấp nước)
        if ($records === [] || ($device->plot_id === null && ! Actuator::query()->where('block_device_id', $device->id)->exists())) {
            return;
        }

        $freshSince = $now->subHours(config('iot.alert_max_age_hours'))->format('Y-m-d H:i:s');
        $latest = collect($records)
            ->filter(fn (array $record) => $record['measured_at'] >= $freshSince)
            ->sortBy('measured_at')
            ->keyBy('metric_id')
            ->map(fn (array $record) => ['value' => $record['value'], 'measured_at' => $record['measured_at']])
            ->all();

        if ($latest !== []) {
            EvaluateThresholds::dispatch($device->id, $latest);
        }
    }

    /**
     * Máy đo mưa vừa ghi nhận mưa (số đo trong 1 giờ qua): cập nhật "đang mưa" của trang trại, báo nếu mưa vừa bắt đầu.
     *
     * @param  array<string, array{metric_id: int, value: float, measured_at: string}>  $records
     */
    private function queueRainCheck(Device $device, array $records, ?Metric $rainfall, CarbonImmutable $now): void
    {
        if ($rainfall === null) {
            return;
        }

        $since = $now->subHour()->format('Y-m-d H:i:s');
        $latest = collect($records)
            ->filter(fn (array $record) => $record['metric_id'] === $rainfall->id && $record['value'] > 0 && $record['measured_at'] >= $since)
            ->sortBy('measured_at')
            ->last();

        if ($latest !== null) {
            ObserveRainGauge::dispatch($device->id, $latest['value'], $latest['measured_at']);
        }
    }

    /**
     * Thiếu giờ đo thì lấy giờ nhận. Nhận epoch giây (hoặc mili giây) và chuỗi ngày giờ ISO 8601.
     */
    public static function parseTime(mixed $value, CarbonImmutable $now): ?CarbonImmutable
    {
        if ($value === null || $value === '') {
            return $now;
        }

        if (is_numeric($value)) {
            $seconds = (int) $value;
            // Đồng hồ chưa chỉnh (mạch vừa khởi động, RTC hết pin) thường trả về năm 1970 / 2000
            if ($seconds <= 0) {
                return null;
            }

            return CarbonImmutable::createFromTimestamp($seconds > 99_999_999_999 ? intdiv($seconds, 1000) : $seconds, $now->getTimezone());
        }

        if (! is_string($value)) {
            return null;
        }

        try {
            return CarbonImmutable::parse($value)->setTimezone($now->getTimezone());
        } catch (Throwable) {
            return null;
        }
    }
}
