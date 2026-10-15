<?php

namespace Database\Factories;

use App\Models\PriceSource;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PriceSource>
 */
class PriceSourceFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'code' => fake()->unique()->slug(2),
            'name' => fake()->company(),
            'homepage_url' => fake()->url(),
            'adapter' => 'sitemap_article',
            'config' => [],
            'is_enabled' => true,
        ];
    }
}
