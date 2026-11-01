<?php

namespace App\Support;

use App\Models\Reading;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Collection;

/**
 * Số đo mới nhất của từng (thiết bị, chỉ số).
 */
final class LatestReadings
{
    /**
     * @param  list<int>  $deviceIds
     * @return Collection<int, Reading>
     */
    public static function forDevices(array $deviceIds): Collection
    {
        if ($deviceIds === []) {
            return collect();
        }

        $latest = fn (Builder $query) => $query->from('readings')
            ->selectRaw('device_id, metric_id, MAX(measured_at) AS latest_at')
            ->whereIn('device_id', $deviceIds)
            ->groupBy('device_id', 'metric_id');

        return Reading::query()
            ->joinSub($latest, 'latest', fn ($join) => $join
                ->on('readings.device_id', '=', 'latest.device_id')
                ->on('readings.metric_id', '=', 'latest.metric_id')
                ->on('readings.measured_at', '=', 'latest.latest_at'))
            ->select('readings.*')
            ->with('metric')
            ->get()
            ->sortBy(fn (Reading $reading) => $reading->metric->sort)
            ->values();
    }

    /**
     * @return array{metric: array<string, mixed>, value: float, measured_at: string}
     */
    public static function present(Reading $reading): array
    {
        return [
            'metric' => [
                'code' => $reading->metric->code,
                'name' => $reading->metric->name,
                'unit' => $reading->metric->unit,
            ],
            'value' => round($reading->value, $reading->metric->decimals),
            'measured_at' => $reading->measured_at->toIso8601String(),
        ];
    }
}
