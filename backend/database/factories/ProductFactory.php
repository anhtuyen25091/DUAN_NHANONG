<?php

namespace Database\Factories;

use App\Models\Category;
use App\Models\Product;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Product>
 */
class ProductFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'category_id' => Category::factory(),
            'code' => fake()->unique()->slug(2),
            'name' => ucfirst(fake()->unique()->words(2, true)),
            'unit' => 'kg',
            'aliases' => [],
            'is_active' => true,
            'sort' => 0,
        ];
    }
}
