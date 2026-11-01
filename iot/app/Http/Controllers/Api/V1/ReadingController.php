<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Device;
use App\Models\Metric;
use App\Support\Ownership;
use App\Support\TimeBucket;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Tra cứu lịch sử số đo để vẽ biểu đồ.
 * interval: raw (từng lần đo), hour, day. Bỏ trống thì tự chọn theo độ dài khoảng thời gian.
 */
class ReadingController extends Controller
{
    private const MAX_RAW_POINTS = 5000;

    public function index(Request $request, Device $device): JsonResponse
    {
        Ownership::device($request, $device, Ownership::VIEW);

        $data = $request->validate([
            'metric' => ['required', 'string', Rule::exists('metrics', 'code')],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after:from'],
            'interval' => ['nullable', Rule::in(['raw', 'hour', 'day'])],
        ]);

        $to = isset($data['to']) ? CarbonImmutable::parse($data['to']) : CarbonImmutable::now();
        $from = isset($data['from']) ? CarbonImmutable::parse($data['from']) : $to->subDay();
        $metric = Metric::byCode()[$data['metric']];
        $interval = $data['interval'] ?? match (true) {
            $from->diffInDays($to) <= 2 => 'raw',
            $from->diffInDays($to) <= 31 => 'hour',
            default => 'day',
        };

        $points = match ($interval) {
            'raw' => $this->raw($device, $metric, $from, $to),
            'hour' => $this->hourly($device, $metric, $from, $to),
            'day' => $this->daily($device, $metric, $from, $to),
        };

        return response()->json([
            'metric' => ['code' => $metric->code, 'name' => $metric->name, 'unit' => $metric->unit],
            'interval' => $interval,
            'from' => $from->toIso8601String(),
            'to' => $to->toIso8601String(),
            'data' => $points,
        ]);
    }

    /**
     * @return list<array{t: string, value: float}>
     */
    private function raw(Device $device, Metric $metric, CarbonImmutable $from, CarbonImmutable $to): array
    {
        return $device->readings()
            ->where('metric_id', $metric->id)
            ->whereBetween('measured_at', [$from, $to])
            ->orderBy('measured_at')
            ->limit(self::MAX_RAW_POINTS)
            ->get(['value', 'measured_at'])
            ->map(fn ($reading) => ['t' => $reading->measured_at->toIso8601String(), 'value' => round($reading->value, $metric->decimals)])
            ->all();
    }

    /**
     * Gộp theo giờ trực tiếp từ số đo thô (luôn có cả giờ hiện tại).
     *
     * @return list<array{t: string, min: float, max: float, avg: float, count: int}>
     */
    private function hourly(Device $device, Metric $metric, CarbonImmutable $from, CarbonImmutable $to): array
    {
        $bucket = TimeBucket::sql('measured_at', 'hour');

        $rows = DB::table('readings')
            ->selectRaw("{$bucket} AS bucket, MIN(value) AS min, MAX(value) AS max, AVG(value) AS avg, COUNT(*) AS count")
            ->where('device_id', $device->id)
            ->where('metric_id', $metric->id)
            ->whereBetween('measured_at', [$from, $to])
            ->groupByRaw($bucket)
            ->orderBy('bucket')
            ->get();

        return $this->present($rows, $metric);
    }

    /**
     * Gộp theo ngày từ bảng gộp theo giờ (số đo thô chỉ giữ 180 ngày).
     *
     * @return list<array{t: string, min: float, max: float, avg: float, count: int}>
     */
    private function daily(Device $device, Metric $metric, CarbonImmutable $from, CarbonImmutable $to): array
    {
        $bucket = TimeBucket::sql('hour', 'day');

        $rows = DB::table('reading_hourly')
            ->selectRaw("{$bucket} AS bucket, MIN(min) AS min, MAX(max) AS max, SUM(avg * count) * 1.0 / SUM(count) AS avg, SUM(count) AS count")
            ->where('device_id', $device->id)
            ->where('metric_id', $metric->id)
            ->whereBetween('hour', [$from->startOfHour(), $to])
            ->groupByRaw($bucket)
            ->orderBy('bucket')
            ->get();

        return $this->present($rows, $metric);
    }

    /**
     * @param  iterable<object{bucket: string, min: mixed, max: mixed, avg: mixed, count: mixed}>  $rows
     * @return list<array{t: string, min: float, max: float, avg: float, count: int}>
     */
    private function present(iterable $rows, Metric $metric): array
    {
        $points = [];
        foreach ($rows as $row) {
            $points[] = [
                't' => CarbonImmutable::parse($row->bucket)->toIso8601String(),
                'min' => round((float) $row->min, $metric->decimals),
                'max' => round((float) $row->max, $metric->decimals),
                'avg' => round((float) $row->avg, $metric->decimals),
                'count' => (int) $row->count,
            ];
        }

        return $points;
    }
}
