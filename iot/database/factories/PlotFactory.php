<?php

namespace Database\Factories;

use App\Enums\PlotType;
use App\Models\Farm;
use App\Models\Plot;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Plot>
 */
class PlotFactory extends Factory
{
    public function definition(): array
    {
        return [
            'farm_id' => Farm::factory(),
            'name' => 'Lô '.fake()->numberBetween(1, 20),
            'type' => PlotType::Field,
        ];
    }
}
