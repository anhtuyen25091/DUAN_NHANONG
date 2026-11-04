<?php

namespace Database\Factories;

use App\Models\ArticleCategory;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<ArticleCategory>
 */
class ArticleCategoryFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $name = 'Chủ đề '.fake()->unique()->word();

        return [
            'name' => $name,
            'slug' => Str::slug($name),
            'icon' => '🌱',
            'description' => null,
            'sort' => 0,
            'is_active' => true,
        ];
    }
}
