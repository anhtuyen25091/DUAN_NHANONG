<?php

namespace Database\Factories;

use App\Enums\PurchaseKind;
use App\Models\Customer;
use App\Models\Purchase;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Purchase>
 */
class PurchaseFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'kind' => PurchaseKind::Buy,
            'customer_id' => null,
            'customer_name' => 'Chú Ba',
            'customer_phone' => '0900000001',
            'date' => '2026-10-15',
            'lines' => [['product_code' => 'ca-phe-robusta', 'name' => 'Cà phê nhân xô', 'kg' => 1000, 'deduct_kg' => 0, 'price' => 93000]],
            'paid' => 0,
        ];
    }

    public function forCustomer(Customer $customer): static
    {
        return $this->state(['user_id' => $customer->user_id, 'customer_id' => $customer->id, 'customer_name' => $customer->name, 'customer_phone' => $customer->phone]);
    }
}
