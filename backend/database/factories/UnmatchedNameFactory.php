<?php

namespace Database\Factories;

use App\Enums\NameKind;
use App\Models\PriceSource;
use App\Models\UnmatchedName;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<UnmatchedName>
 */
class UnmatchedNameFactory extends Factory
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
            'kind' => NameKind::Product,
            'name' => $name = ucfirst(fake()->words(2, true)),
            'normalized' => mb_strtolower($name),
            'seen_count' => 1,
            'last_seen_at' => now(),
            'resolved' => false,
        ];
    }
}
