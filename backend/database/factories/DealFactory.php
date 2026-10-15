<?php

namespace Database\Factories;

use App\Enums\DealStatus;
use App\Models\Deal;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Deal>
 */
class DealFactory extends Factory
{
    /**
     * Mặc định: thương lái tạo đơn mua, chưa có nông dân tham gia.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $buyer = User::factory();

        return [
            'created_by' => $buyer,
            'buyer_id' => $buyer,
            'seller_id' => null,
            'seller_name' => 'Vườn '.fake()->lastName(),
            'title' => 'Sầu riêng Ri6',
            'unit' => 'kg',
            'status' => DealStatus::Open,
        ];
    }

    /** Bên bán đã tham gia */
    public function joined(?User $seller = null): static
    {
        return $this->state(fn (array $attributes) => ['seller_id' => $seller?->id ?? User::factory()]);
    }
}
