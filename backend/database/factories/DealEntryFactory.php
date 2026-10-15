<?php

namespace Database\Factories;

use App\Enums\DealEntryKind;
use App\Enums\DealEntryStatus;
use App\Models\Deal;
use App\Models\DealEntry;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<DealEntry>
 */
class DealEntryFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'deal_id' => Deal::factory(),
            'kind' => DealEntryKind::Deposit,
            'date' => '2026-08-01',
            'amount' => 100_000_000,
            'created_by' => fn (array $attributes) => Deal::query()->find($attributes['deal_id'])->created_by,
            'status' => DealEntryStatus::Pending,
        ];
    }
}
