<?php

namespace Database\Factories;

use App\Enums\DeviceKind;
use App\Models\Device;
use App\Models\Farm;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Device>
 */
class DeviceFactory extends Factory
{
    public function definition(): array
    {
        return [
            'farm_id' => Farm::factory(),
            'name' => 'Cảm biến '.fake()->numberBetween(1, 99),
            'kind' => DeviceKind::Esp32,
        ];
    }

    public function lorawan(string $devEui, string $profile = 'generic'): static
    {
        return $this->state(['kind' => DeviceKind::LoRaWan, 'dev_eui' => $devEui, 'profile' => $profile]);
    }
}
