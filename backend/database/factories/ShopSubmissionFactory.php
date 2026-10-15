<?php

namespace Database\Factories;

use App\Enums\SubmissionStatus;
use App\Models\ShopSubmission;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ShopSubmission>
 */
class ShopSubmissionFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'data' => [
                'name' => 'Cửa hàng VTNN '.fake()->lastName(),
                'types' => ['phan_bon'],
                'address' => fake()->streetAddress(),
                'province_code' => 'gia-lai',
                'phone' => '0911111111',
            ],
            'status' => SubmissionStatus::Pending,
        ];
    }
}
