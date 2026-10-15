<?php

namespace Database\Factories;

use App\Enums\ReportStatus;
use App\Models\Buyer;
use App\Models\PriceReport;
use App\Models\Product;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * Giá điểm mua đăng hôm nay; vị trí lấy theo điểm mua.
 *
 * @extends Factory<PriceReport>
 */
class PriceReportFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'buyer_id' => Buyer::factory(),
            'product_id' => Product::factory(),
            'date' => now()->toDateString(),
            'price' => 93000,
            'unit' => 'kg',
            'province_code' => fn (array $attributes) => Buyer::query()->find($attributes['buyer_id'])->province_code,
            'lat' => fn (array $attributes) => Buyer::query()->find($attributes['buyer_id'])->lat,
            'lng' => fn (array $attributes) => Buyer::query()->find($attributes['buyer_id'])->lng,
            'status' => ReportStatus::Published,
        ];
    }
}
