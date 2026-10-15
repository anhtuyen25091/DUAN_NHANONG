<?php

namespace Database\Factories;

use App\Enums\CrawlStatus;
use App\Models\CrawlLog;
use App\Models\PriceSource;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<CrawlLog>
 */
class CrawlLogFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'price_source_id' => PriceSource::factory(),
            'target_date' => now()->toDateString(),
            'url' => fake()->url(),
            'status' => CrawlStatus::Success,
            'items_count' => 0,
        ];
    }
}
