<?php

namespace App\Console\Commands;

use App\Support\TimeBucket;
use Carbon\CarbonImmutable;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Gộp số đo thô thành min/max/trung bình theo giờ. Xét theo giờ NHẬN để bắt cả dữ liệu gửi bù
 * (số đo của hôm qua vừa về thì giờ hôm qua được tính lại).
 */
#[Signature('readings:rollup {--hours=2 : Xét số đo nhận trong N giờ qua} {--all : Tính lại toàn bộ}')]
#[Description('Gộp số đo theo giờ (bảng reading_hourly) để vẽ biểu đồ dài ngày')]
class RollupReadings extends Command
{
    public function handle(): int
    {
        $bucket = TimeBucket::sql('measured_at', 'hour');

        // Các (thiết bị, chỉ số) có số đo mới về, cùng khoảng giờ đo bị ảnh hưởng
        $affected = DB::table('readings')
            ->selectRaw('device_id, metric_id, MIN(measured_at) AS first_at, MAX(measured_at) AS last_at')
            ->unless($this->option('all'), fn ($query) => $query->where('received_at', '>=', now()->subHours((int) $this->option('hours'))))
            ->groupBy('device_id', 'metric_id')
            ->get();

        $buckets = 0;
        foreach ($affected as $series) {
            // Lấy trọn từ đầu giờ đến cuối giờ để giờ đầu / cuối không bị thiếu số đo
            $rows = DB::table('readings')
                ->selectRaw("device_id, metric_id, {$bucket} AS hour, MIN(value) AS min, MAX(value) AS max, AVG(value) AS avg, COUNT(*) AS count")
                ->where('device_id', $series->device_id)
                ->where('metric_id', $series->metric_id)
                ->whereBetween('measured_at', [
                    CarbonImmutable::parse($series->first_at)->startOfHour(),
                    CarbonImmutable::parse($series->last_at)->endOfHour(),
                ])
                ->groupBy('device_id', 'metric_id')
                ->groupByRaw($bucket)
                ->get()
                ->map(fn ($row) => [
                    'device_id' => $row->device_id,
                    'metric_id' => $row->metric_id,
                    'hour' => $row->hour,
                    'min' => $row->min,
                    'max' => $row->max,
                    'avg' => round((float) $row->avg, 3),
                    'count' => $row->count,
                ]);

            foreach ($rows->chunk(500) as $chunk) {
                DB::table('reading_hourly')->upsert($chunk->values()->all(), ['device_id', 'metric_id', 'hour'], ['min', 'max', 'avg', 'count']);
            }
            $buckets += $rows->count();
        }

        $this->info("Đã gộp {$buckets} giờ của {$affected->count()} chuỗi số đo.");

        return self::SUCCESS;
    }
}
