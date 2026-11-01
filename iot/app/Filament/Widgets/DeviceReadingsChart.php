<?php

namespace App\Filament\Widgets;

use App\Models\Device;
use App\Models\Metric;
use App\Support\TimeBucket;
use Filament\Widgets\ChartWidget;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Biểu đồ 7 ngày (trung bình / thấp nhất / cao nhất theo giờ) của 1 chỉ số, ở trang chi tiết thiết bị.
 */
class DeviceReadingsChart extends ChartWidget
{
    protected static bool $isDiscovered = false;

    protected int|string|array $columnSpan = 'full';

    protected ?string $maxHeight = '320px';

    public ?Model $record = null;

    public function getHeading(): string
    {
        $metric = $this->metric();

        return $metric ? "{$metric->name} 7 ngày qua".($metric->unit ? " ({$metric->unit})" : '') : 'Chưa có số đo';
    }

    protected function getFilters(): ?array
    {
        return Metric::query()
            ->whereIn('id', $this->device()->readings()->distinct()->select('metric_id'))
            ->orderBy('sort')
            ->pluck('name', 'code')
            ->all();
    }

    protected function getData(): array
    {
        $metric = $this->metric();
        if ($metric === null) {
            return ['datasets' => [], 'labels' => []];
        }

        $bucket = TimeBucket::sql('measured_at', 'hour');
        $rows = DB::table('readings')
            ->selectRaw("{$bucket} AS bucket, AVG(value) AS avg, MIN(value) AS min, MAX(value) AS max")
            ->where('device_id', $this->device()->id)
            ->where('metric_id', $metric->id)
            ->where('measured_at', '>=', now()->subDays(7))
            ->groupByRaw($bucket)
            ->orderBy('bucket')
            ->get();

        $series = fn (string $column) => $rows->map(fn ($row) => round((float) $row->{$column}, $metric->decimals))->all();

        return [
            'datasets' => [
                ['label' => 'Trung bình', 'data' => $series('avg'), 'borderColor' => '#059669', 'pointRadius' => 0, 'tension' => 0.3],
                ['label' => 'Thấp nhất', 'data' => $series('min'), 'borderColor' => '#93c5fd', 'borderDash' => [4, 4], 'pointRadius' => 0],
                ['label' => 'Cao nhất', 'data' => $series('max'), 'borderColor' => '#fca5a5', 'borderDash' => [4, 4], 'pointRadius' => 0],
            ],
            'labels' => $rows->map(fn ($row) => Carbon::parse($row->bucket)->format('d/m H:00'))->all(),
        ];
    }

    protected function getType(): string
    {
        return 'line';
    }

    private function device(): Device
    {
        /** @var Device */
        return $this->record;
    }

    private function metric(): ?Metric
    {
        $filters = $this->getFilters();
        $this->filter ??= array_key_first($filters ?? []);

        return $this->filter ? (Metric::byCode()[$this->filter] ?? null) : null;
    }
}
