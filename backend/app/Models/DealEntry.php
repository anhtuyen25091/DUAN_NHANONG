<?php

namespace App\Models;

use App\Enums\DealEntryKind;
use App\Enums\DealEntryStatus;
use Database\Factories\DealEntryFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

/**
 * 1 mục của đơn mua bán: cọc, đợt cân (nhiều loại hàng), lần trả tiền, chi phí riêng.
 */
#[Fillable(['kind', 'date', 'lines', 'amount', 'kg', 'deposit_deduct', 'paid', 'note'])]
class DealEntry extends Model
{
    /** @use HasFactory<DealEntryFactory> */
    use HasFactory, SoftDeletes;

    protected function casts(): array
    {
        return [
            'kind' => DealEntryKind::class,
            'status' => DealEntryStatus::class,
            'date' => 'date',
            'lines' => 'array',
            'amount' => 'integer',
            'kg' => 'float',
            'deposit_deduct' => 'integer',
            'paid' => 'integer',
            'responded_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (DealEntry $entry): void {
            $entry->uuid ??= (string) Str::uuid();
        });
    }

    public function getRouteKeyName(): string
    {
        return 'uuid';
    }

    /** "Đợt cân 162.500.000 đ (3.500 kg)", "Cọc 150.000.000 đ" để ghi vào thông báo */
    public function describe(): string
    {
        $money = number_format($this->amount, 0, ',', '.').' đ';

        return match ($this->kind) {
            DealEntryKind::Cut => 'Đợt cân '.$money.' ('.rtrim(rtrim(number_format($this->kg, 3, ',', '.'), '0'), ',').' kg)',
            DealEntryKind::Deposit => 'Cọc '.$money,
            DealEntryKind::Payment => 'Trả tiền '.$money,
            DealEntryKind::Cost => 'Chi phí '.$money,
        };
    }

    /**
     * @return BelongsTo<Deal, $this>
     */
    public function deal(): BelongsTo
    {
        return $this->belongsTo(Deal::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
