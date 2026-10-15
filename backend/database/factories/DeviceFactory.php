<?php

namespace Database\Factories;

use App\Models\Device;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Device>
 */
class DeviceFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'uuid' => fake()->uuid(),
            'push_token' => 'ExponentPushToken['.fake()->bothify('????????????????').']',
            'platform' => 'android',
            'last_seen_at' => now(),
        ];
    }
}
