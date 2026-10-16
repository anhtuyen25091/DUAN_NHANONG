<?php

namespace App\Models;

use App\Enums\PurchaseKind;
use Database\Factories\PurchaseFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

/**
 * Phiếu mua / bán 1 lần của điểm thu mua: cân nhiều loại hàng, trừ bì, đã trả bao nhiêu, còn nợ.
 */
#[Fillable(['kind', 'customer_name', 'customer_phone', 'date', 'lines', 'paid', 'note'])]
class Purchase extends Model
{
    /** @use HasFactory<PurchaseFactory> */
    use HasFactory, SoftDeletes;

    protected function casts(): array
    {
        return [
            'kind' => PurchaseKind::class,
            'date' => 'date',
            'lines' => 'array',
            'kg' => 'float',
            'amount' => 'integer',
            'paid' => 'integer',
            'number' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (Purchase $purchase): void {
            $purchase->uuid ??= (string) Str::uuid();
            // Số phiếu kế tiếp của người dùng (kể cả phiếu đã xóa, để số in ra không bị trùng)
            $purchase->number ??= (int) self::withTrashed()->where('user_id', $purchase->user_id)->where('kind', $purchase->kind)->max('number') + 1;
        });

        static::saving(function (Purchase $purchase): void {
            $purchase->lines = self::normalizeLines($purchase->lines ?? []);
            $purchase->kg = round(array_sum(array_column($purchase->lines, 'net_kg')), 3);
            $purchase->amount = (int) array_sum(array_column($purchase->lines, 'amount'));
        });
    }

    public function getRouteKeyName(): string
    {
        return 'uuid';
    }

    /**
     * Tính kg tịnh và thành tiền từng dòng: tịnh = cân − trừ bì; tiền = tịnh × đơn giá (làm tròn đồng).
     *
     * @param  list<array<string, mixed>>  $lines
     * @return list<array{product_code: string|null, name: string, kg: float, deduct_kg: float, net_kg: float, price: int, amount: int}>
     */
    public static function normalizeLines(array $lines): array
    {
        return array_values(array_map(function (array $line): array {
            $kg = round((float) ($line['kg'] ?? 0), 3);
            $deduct = round(min((float) ($line['deduct_kg'] ?? 0), $kg), 3);
            $net = round($kg - $deduct, 3);
            $price = (int) ($line['price'] ?? 0);

            return [
                'product_code' => $line['product_code'] ?? null,
                'name' => (string) ($line['name'] ?? ''),
                'kg' => $kg,
                'deduct_kg' => $deduct,
                'net_kg' => $net,
                'price' => $price,
                'amount' => (int) round($net * $price),
            ];
        }, $lines));
    }

    /** "PM-000012" */
    public function code(): string
    {
        return $this->kind->prefix().'-'.str_pad((string) $this->number, 6, '0', STR_PAD_LEFT);
    }

    public function owing(): int
    {
        return max(0, $this->amount - $this->paid);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return BelongsTo<Customer, $this>
     */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }
}
