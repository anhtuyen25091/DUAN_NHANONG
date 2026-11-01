<?php

namespace Database\Factories;

use App\Models\Farm;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Farm>
 */
class FarmFactory extends Factory
{
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'name' => 'Trang trại '.fake()->lastName(),
            'province' => fake()->randomElement(['An Giang', 'Cần Thơ', 'Đắk Lắk', 'Lâm Đồng', 'Cà Mau']),
        ];
    }
}
