<?php

namespace Database\Seeders;

use App\Models\FieldMap;
use App\Models\Metric;
use Illuminate\Database\Seeder;

/**
 * Tên trường mà decoder (payload formatter) chính hãng trả về cho từng loại thiết bị LoRaWAN.
 * Loại "generic" không cần khai báo: tên trường trùng mã chỉ số (soil_ph, water_level...) là nhận luôn.
 * Thêm loại mới trong /admin > Ánh xạ trường.
 */
class FieldMapSeeder extends Seeder
{
    /** @var array<string, array<string, array{0: string, 1?: float}>> */
    public const PROFILES = [
        // Dragino SE01-LB / LSE01: độ ẩm, nhiệt độ, độ dẫn điện đất
        'dragino-se01' => [
            'water_SOIL' => ['soil_moisture'],
            'temp_SOIL' => ['soil_temp'],
            'conduct_SOIL' => ['soil_ec'],
        ],
        // Dragino PS-LB: đầu dò áp suất thả chìm đo mực nước
        'dragino-ps-lb' => [
            'Water_deep_cm' => ['water_level'],
        ],
        // Milesight EM500-SMTC: độ ẩm, nhiệt độ, độ dẫn điện đất
        'milesight-em500-smtc' => [
            'moisture' => ['soil_moisture'],
            'temperature' => ['soil_temp'],
            'conductivity' => ['soil_ec'],
            'battery' => ['battery'],
        ],
        // Milesight EM500-SWL: mực nước thả chìm (decoder trả về cm; nếu bản decoder trả mét thì đặt hệ số 100)
        'milesight-em500-swl' => [
            'water_level' => ['water_level'],
            'battery' => ['battery'],
        ],
        // Seeed SenseCAP S2105 (đã dùng decoder dạng phẳng trên network server)
        'sensecap-s2105' => [
            'soil_moisture' => ['soil_moisture'],
            'soil_temperature' => ['soil_temp'],
            'soil_ec' => ['soil_ec', 1000],
            'battery' => ['battery'],
        ],
        // Seeed SenseCAP S2120: trạm thời tiết 8-trong-1
        'sensecap-s2120' => [
            'air_temperature' => ['air_temp'],
            'air_humidity' => ['air_humidity'],
            'light_intensity' => ['light'],
            'wind_speed' => ['wind_speed'],
            'rain_gauge' => ['rainfall'],
            'battery' => ['battery'],
        ],
    ];

    public function run(): void
    {
        $metrics = Metric::query()->pluck('id', 'code');

        foreach (self::PROFILES as $profile => $fields) {
            foreach ($fields as $field => $target) {
                FieldMap::query()->updateOrCreate(
                    ['profile' => $profile, 'field' => $field],
                    ['metric_id' => $metrics[$target[0]], 'scale' => $target[1] ?? 1],
                );
            }
        }
    }
}
