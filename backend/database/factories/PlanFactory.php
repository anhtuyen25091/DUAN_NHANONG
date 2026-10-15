<?php

namespace Database\Factories;

use App\Models\Plan;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Plan>
 */
class PlanFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'code' => fake()->unique()->slug(1),
            'name' => 'Gói '.fake()->word(),
            'months' => 1,
            'price' => 29000,
            'description' => null,
            'is_active' => true,
            'sort' => 0,
        ];
    }
}
