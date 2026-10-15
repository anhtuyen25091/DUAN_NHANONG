<?php

namespace Database\Factories;

use App\Enums\BuyerKind;
use App\Enums\BuyerStatus;
use App\Models\Buyer;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * Điểm mua ở Buôn Ma Thuột (Đắk Lắk), chờ duyệt.
 *
 * @extends Factory<Buyer>
 */
class BuyerFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'name' => 'Đại lý '.fake()->lastName(),
            'kind' => BuyerKind::Agent,
            'deals_in' => ['thu_mua'],
            'phone' => '0262'.fake()->numerify('#######'),
            'address' => 'QL14, Buôn Ma Thuột',
            'province_code' => 'dak-lak',
            'lat' => 12.6667,
            'lng' => 108.05,
            'goods' => 'Thu mua cà phê, tiêu',
            'status' => BuyerStatus::Pending,
        ];
    }

    /** Đã duyệt (kèm điểm bán đi kèm) */
    public function approved(): static
    {
        return $this->afterCreating(fn (Buyer $buyer) => $buyer->approve());
    }
}
