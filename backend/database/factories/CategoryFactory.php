<?php

namespace Database\Factories;

use App\Enums\CategoryType;
use App\Models\Category;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Category>
 */
class CategoryFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'type' => CategoryType::NongSan,
            'name' => ucfirst(fake()->unique()->word()),
            'slug' => fake()->unique()->slug(2),
            'sort' => 0,
        ];
    }
}
