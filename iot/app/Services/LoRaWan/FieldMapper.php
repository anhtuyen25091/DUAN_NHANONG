<?php

namespace App\Services\LoRaWan;

use App\Models\FieldMap;
use App\Models\Metric;

/**
 * Đổi dữ liệu đã giải mã của thiết bị LoRaWAN thành các dòng số đo theo bảng ánh xạ của loại thiết bị.
 * Trường có tên trùng mã chỉ số (soil_ph, water_level...) thì nhận luôn, không cần khai báo.
 */
final class FieldMapper
{
    /**
     * @return list<array{metric: string, value: float, t: ?string}>
     */
    public static function rows(string $profile, Uplink $uplink): array
    {
        $maps = FieldMap::query()->with('metric')->where('profile', $profile)->get()->keyBy('field');
        $metrics = Metric::byCode();

        $rows = [];
        foreach ($uplink->fields as $field => $value) {
            if (! is_numeric($value)) {
                continue;
            }

            $map = $maps[$field] ?? null;
            if ($map !== null) {
                $rows[] = ['metric' => $map->metric->code, 'value' => (float) $value * $map->scale, 't' => $uplink->time];
            } elseif (isset($metrics[$field])) {
                $rows[] = ['metric' => $field, 'value' => (float) $value, 't' => $uplink->time];
            }
        }

        return $rows;
    }
}
