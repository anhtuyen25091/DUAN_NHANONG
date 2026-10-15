<?php

namespace Database\Factories;

use App\Enums\ShopType;
use App\Models\Shop;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Shop>
 */
class ShopFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => 'Đại lý '.fake()->lastName(),
            'types' => [ShopType::PhanBon, ShopType::ThuocBvtv],
            'address' => fake()->streetAddress(),
            'province_code' => 'dak-lak',
            'lat' => 12.68,
            'lng' => 108.05,
            'phone' => '0900000000',
            'source' => 'admin',
            'is_verified' => true,
            'is_active' => true,
        ];
    }
}
