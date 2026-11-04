<?php

namespace Database\Factories;

use App\Enums\ArticleStatus;
use App\Models\Article;
use App\Models\ArticleCategory;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Article>
 */
class ArticleFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $title = fake()->unique()->sentence(6);

        return [
            'article_category_id' => ArticleCategory::factory(),
            'title' => $title,
            'slug' => Str::slug($title),
            'excerpt' => fake()->sentence(15),
            'content' => '<p>'.fake()->paragraph().'</p>',
            'status' => ArticleStatus::Published,
            'published_at' => now()->subDay(),
            'is_featured' => false,
        ];
    }

    public function draft(): static
    {
        return $this->state(['status' => ArticleStatus::Draft, 'published_at' => null]);
    }

    public function scheduled(): static
    {
        return $this->state(['published_at' => now()->addDay()]);
    }
}
