<?php

namespace App\Businesses;

use App\Models\Business;
use App\Models\BusinessBuyPrice;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

/**
 * Giá mua chủ chốt cho lái con: giá đang áp dụng vào 1 ngày (lần chốt gần nhất tính tới ngày đó),
 * và các dòng hàng trên phiếu mua vượt giá chốt.
 */
class BuyPriceLimits
{
    public const WARN = 'warn';

    public const BLOCK = 'block';

    /**
     * Giá chốt đang áp dụng vào ngày $date, theo mã mặt hàng (bỏ các mặt hàng đã bỏ giới hạn)
     *
     * @return Collection<string, array{product_code: string, name: string, unit: string, max_price: int, date: string, set_by: string|null}>
     */
    public static function on(Business $business, CarbonInterface $date): Collection
    {
        return BusinessBuyPrice::query()
            ->where('business_id', $business->id)
            ->whereDate('date', '<=', $date->toDateString())
            ->with(['product', 'setter'])
            ->orderByDesc('date')
            ->get()
            ->unique('product_id')
            ->filter(fn (BusinessBuyPrice $p): bool => $p->max_price !== null && $p->product !== null)
            ->mapWithKeys(fn (BusinessBuyPrice $p): array => [$p->product->code => [
                'product_code' => $p->product->code,
                'name' => $p->product->name,
                'unit' => $p->product->unit,
                'max_price' => $p->max_price,
                'date' => $p->date->toDateString(),
                'set_by' => $p->setter?->name,
            ]])
            ->sortBy('name');
    }

    /**
     * Các dòng hàng (đã chọn mặt hàng trong danh mục) có đơn giá vượt giá chốt vào ngày phiếu
     *
     * @param  list<array<string, mixed>>  $lines
     * @return list<array{product_code: string, name: string, price: int, max_price: int}>
     */
    public static function violations(Business $business, CarbonInterface $date, array $lines): array
    {
        $limits = self::on($business, $date);
        $violations = [];
        foreach ($lines as $line) {
            $limit = $limits->get($line['product_code'] ?? '');
            if ($limit !== null && (int) $line['price'] > $limit['max_price']) {
                $violations[] = ['product_code' => $limit['product_code'], 'name' => (string) $line['name'], 'price' => (int) $line['price'], 'max_price' => $limit['max_price']];
            }
        }

        return $violations;
    }

    /** "Cà phê nhân xô 95.000 đ (chốt 93.000 đ)" */
    public static function describe(array $violation): string
    {
        $vnd = fn (int $v): string => number_format($v, 0, ',', '.').' đ';

        return "{$violation['name']} {$vnd($violation['price'])} (chốt {$vnd($violation['max_price'])})";
    }
}
