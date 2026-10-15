<?php

namespace Database\Factories;

use App\Enums\PriceStatus;
use App\Models\Price;
use App\Models\Product;
use App\Models\Region;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Price>
 */
class PriceFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'product_id' => Product::factory(),
            'region_id' => Region::factory(),
            'price_source_id' => null,
            'date' => now()->toDateString(),
            'price_min' => fn (array $attributes): int => $attributes['price_avg'],
            'price_max' => fn (array $attributes): int => $attributes['price_avg'],
            'price_avg' => fake()->numberBetween(50, 150) * 1000,
            'unit' => 'kg',
            'status' => PriceStatus::Published,
        ];
    }
}
