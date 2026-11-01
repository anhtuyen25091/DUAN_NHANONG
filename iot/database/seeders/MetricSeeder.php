<?php

namespace Database\Seeders;

use App\Models\Metric;
use Illuminate\Database\Seeder;

/**
 * Danh mục chỉ số. Khoảng hợp lệ lấy theo dải đo phổ biến của cảm biến (rộng hơn thực tế một chút);
 * ngoài khoảng này coi như cảm biến lỗi và bỏ qua.
 */
class MetricSeeder extends Seeder
{
    /** @var list<array{0: string, 1: string, 2: ?string, 3: string, 4: float, 5: float, 6: int}> */
    public const METRICS = [
        // Đất (cảm biến 7-trong-1 RS485, Dragino SE01, Milesight EM500-SMTC, SenseCAP S2105)
        ['soil_moisture', 'Độ ẩm đất', '%', 'soil', 0, 100, 1],
        ['soil_temp', 'Nhiệt độ đất', '°C', 'soil', -20, 80, 1],
        ['soil_ec', 'Độ dẫn điện đất (EC)', 'µS/cm', 'soil', 0, 20000, 0],
        ['soil_ph', 'pH đất', null, 'soil', 0, 14, 1],
        ['soil_n', 'Đạm (N)', 'mg/kg', 'soil', 0, 2000, 0],
        ['soil_p', 'Lân (P)', 'mg/kg', 'soil', 0, 2000, 0],
        ['soil_k', 'Kali (K)', 'mg/kg', 'soil', 0, 2000, 0],
        // Nước ao / ruộng / kênh
        ['water_level', 'Mực nước', 'cm', 'water', -200, 2000, 1],
        ['water_ph', 'pH nước', null, 'water', 0, 14, 2],
        ['water_temp', 'Nhiệt độ nước', '°C', 'water', -5, 60, 1],
        ['water_do', 'Oxy hòa tan (DO)', 'mg/L', 'water', 0, 30, 2],
        ['water_orp', 'Thế oxy hóa khử (ORP)', 'mV', 'water', -2000, 2000, 0],
        ['salinity', 'Độ mặn', '‰', 'water', 0, 80, 1],
        ['water_ec', 'Độ dẫn điện nước (EC)', 'µS/cm', 'water', 0, 200000, 0],
        ['turbidity', 'Độ đục', 'NTU', 'water', 0, 4000, 0],
        // Thời tiết (SenseCAP S2120, trạm đo mưa)
        ['air_temp', 'Nhiệt độ không khí', '°C', 'weather', -20, 70, 1],
        ['air_humidity', 'Độ ẩm không khí', '%', 'weather', 0, 100, 0],
        ['rainfall', 'Lượng mưa', 'mm', 'weather', 0, 1000, 1],
        ['light', 'Ánh sáng', 'lux', 'weather', 0, 200000, 0],
        ['wind_speed', 'Tốc độ gió', 'm/s', 'weather', 0, 80, 1],
        // Tình trạng thiết bị
        ['battery', 'Pin', '%', 'device', 0, 100, 0],
    ];

    public function run(): void
    {
        foreach (self::METRICS as $sort => [$code, $name, $unit, $group, $min, $max, $decimals]) {
            Metric::query()->updateOrCreate(['code' => $code], [
                'name' => $name,
                'unit' => $unit,
                'group' => $group,
                'min_valid' => $min,
                'max_valid' => $max,
                'decimals' => $decimals,
                'sort' => $sort,
            ]);
        }
    }
}
