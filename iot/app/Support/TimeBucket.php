<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * Biểu thức SQL làm tròn thời điểm về đầu giờ / đầu ngày (MySQL khi chạy thật, SQLite khi test).
 */
final class TimeBucket
{
    public static function sql(string $column, string $interval): string
    {
        $format = $interval === 'day' ? '%Y-%m-%d 00:00:00' : '%Y-%m-%d %H:00:00';

        return match (DB::connection()->getDriverName()) {
            'sqlite' => "strftime('{$format}', {$column})",
            'pgsql' => "date_trunc('{$interval}', {$column})",
            default => "DATE_FORMAT({$column}, '{$format}')",
        };
    }
}
