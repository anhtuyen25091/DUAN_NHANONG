<?php

namespace Database\Factories;

use App\Enums\AlertCondition;
use App\Models\Device;
use App\Models\PriceAlert;
use App\Models\Product;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PriceAlert>
 */
class PriceAlertFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'device_id' => Device::factory(),
            'product_id' => Product::factory(),
            'region_id' => null,
            'condition' => AlertCondition::Change,
            'threshold' => null,
            'is_triggered' => false,
        ];
    }
}
