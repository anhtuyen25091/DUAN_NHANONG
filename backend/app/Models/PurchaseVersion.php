<?php

namespace App\Models;

use App\Documents\TransactionDocuments;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * 1 bản của phiếu mua / bán (ảnh chụp lúc lưu). Không sửa, không xóa riêng.
 *
 * @property array{customer_name: string, customer_phone: string|null, date: string, lines: list<array<string, mixed>>, kg: float, amount: int, paid: int, note: string|null} $data
 */
class PurchaseVersion extends Model
{
    public const UPDATED_AT = null;

    protected $guarded = [];

    protected function casts(): array
    {
        return ['data' => 'array', 'version' => 'integer', 'created_at' => 'datetime'];
    }

    /**
     * @return BelongsTo<Purchase, $this>
     */
    public function purchase(): BelongsTo
    {
        return $this->belongsTo(Purchase::class);
    }

    /**
     * Đổi gì so với bản trước, viết cho người đọc: "Cà phê nhân xô: 1.238 kg → 1.250 kg", "Đã trả: 100.000.000 đ → 160.254.000 đ"
     *
     * @param  array<string, mixed>  $before
     * @param  array<string, mixed>  $after
     * @return list<string>
     */
    public static function changes(array $before, array $after): array
    {
        $kg = fn ($v): string => TransactionDocuments::kg((float) $v).' kg';
        $vnd = fn ($v): string => TransactionDocuments::vnd((int) $v);
        $changes = [];

        if ($before['customer_name'] !== $after['customer_name'] || ($before['customer_phone'] ?? null) !== ($after['customer_phone'] ?? null)) {
            $changes[] = 'Khách: '.trim($before['customer_name'].' '.($before['customer_phone'] ?? '')).' → '.trim($after['customer_name'].' '.($after['customer_phone'] ?? ''));
        }
        if ($before['date'] !== $after['date']) {
            $changes[] = 'Ngày: '.TransactionDocuments::date($before['date']).' → '.TransactionDocuments::date($after['date']);
        }

        // Dòng hàng: so theo tên hàng
        $old = collect($before['lines'])->keyBy('name');
        $new = collect($after['lines'])->keyBy('name');
        foreach ($new as $name => $line) {
            $prev = $old->get($name);
            if ($prev === null) {
                $changes[] = "Thêm {$name}: {$kg($line['net_kg'])} × {$vnd($line['price'])}";

                continue;
            }
            $parts = [];
            if ((float) $prev['kg'] !== (float) $line['kg']) {
                $parts[] = 'cân '.$kg($prev['kg']).' → '.$kg($line['kg']);
            }
            if ((float) $prev['deduct_kg'] !== (float) $line['deduct_kg']) {
                $parts[] = 'trừ bì '.$kg($prev['deduct_kg']).' → '.$kg($line['deduct_kg']);
            }
            if ((int) $prev['price'] !== (int) $line['price']) {
                $parts[] = 'giá '.$vnd($prev['price']).' → '.$vnd($line['price']);
            }
            if ($parts) {
                $changes[] = $name.': '.implode(', ', $parts);
            }
        }
        foreach ($old as $name => $line) {
            if (! $new->has($name)) {
                $changes[] = "Bỏ {$name}: {$kg($line['net_kg'])} × {$vnd($line['price'])}";
            }
        }

        if ((int) $before['amount'] !== (int) $after['amount']) {
            $changes[] = 'Tổng tiền: '.$vnd($before['amount']).' → '.$vnd($after['amount']);
        }
        if ((int) $before['paid'] !== (int) $after['paid']) {
            $changes[] = 'Đã trả: '.$vnd($before['paid']).' → '.$vnd($after['paid']);
        }
        if (($before['note'] ?? null) !== ($after['note'] ?? null)) {
            $changes[] = 'Ghi chú: "'.($before['note'] ?? '').'" → "'.($after['note'] ?? '').'"';
        }

        return $changes;
    }
}
