<?php

namespace Database\Seeders;

use App\Models\Plan;
use Illuminate\Database\Seeder;

/**
 * Gói xem toàn bộ lịch sử giá. Giá tạm, đổi trong /admin.
 */
class PlanSeeder extends Seeder
{
    public function run(): void
    {
        $plans = [
            ['code' => 'thang', 'name' => 'Gói tháng', 'months' => 1, 'price' => 29000, 'description' => 'Xem toàn bộ lịch sử giá trong 1 tháng', 'sort' => 1],
            ['code' => 'nam', 'name' => 'Gói năm', 'months' => 12, 'price' => 199000, 'description' => 'Tiết kiệm hơn 40% so với gói tháng', 'sort' => 2],
        ];

        foreach ($plans as $plan) {
            Plan::query()->firstOrCreate(['code' => $plan['code']], $plan);
        }
    }
}
