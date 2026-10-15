<?php

namespace App\Queries;

use App\Models\Price;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * Đọc giá đã đăng cho web/app.
 * Cùng mặt hàng + khu vực + ngày mà có nhiều nguồn thì gộp: thấp nhất, cao nhất, trung bình các nguồn.
 */
class PriceBoard
{
    /** Chỉ tìm giá gần nhất trong khoảng này (ngày) */
    private const LOOKBACK_DAYS = 14;

    /**
     * Giá mới nhất (tính đến $date) của từng mặt hàng × khu vực, kèm mức thay đổi so với lần có giá trước đó.
     *
     * @param  array{category?: string|null, type?: string|null, region?: string|null, product?: string|null}  $filters
     * @return Collection<int, array<string, mixed>>
     */
    public function latest(CarbonImmutable $date, array $filters = []): Collection
    {
        $rows = Price::query()
            ->published()
            ->whereBetween('date', [$date->subDays(self::LOOKBACK_DAYS)->toDateString(), $date->toDateString()])
            ->whereHas('product', fn (Builder $query) => $query->active())
            ->when($filters['product'] ?? null, fn (Builder $query, string $code) => $query->whereRelation('product', 'code', $code))
            ->when($filters['category'] ?? null, fn (Builder $query, string $slug) => $query->whereRelation('product.category', 'slug', $slug))
            ->when($filters['type'] ?? null, fn (Builder $query, string $type) => $query->whereRelation('product.category', 'type', $type))
            ->when($filters['region'] ?? null, fn (Builder $query, string $code) => $query->whereRelation('region', 'code', $code))
            ->with(['product.category', 'region', 'priceSource:id,name'])
            ->orderByDesc('date')
            ->orderBy('id')
            ->get();

        return $rows
            ->groupBy(fn (Price $price): string => $price->product_id.'|'.$price->region_id)
            ->map(function (Collection $prices): array {
                $byDate = $prices->groupBy('date');
                $dates = $byDate->keys()->sortDesc()->values();
                $latest = $this->combine($byDate[$dates[0]]);
                $previous = isset($dates[1]) ? $this->combine($byDate[$dates[1]]) : null;
                $first = $prices->first();

                $change = $previous === null ? null : $latest['avg'] - $previous['avg'];

                return [
                    'product' => $first->product,
                    'region' => $first->region,
                    'date' => $dates[0],
                    'price_min' => $latest['min'],
                    'price_max' => $latest['max'],
                    'price_avg' => $latest['avg'],
                    'unit' => $first->unit,
                    'change' => $change,
                    'change_percent' => $change === null || $previous['avg'] === 0
                        ? null
                        : round($change / $previous['avg'] * 100, 2),
                    'previous_date' => $dates[1] ?? null,
                    'sources' => $byDate[$dates[0]]
                        ->map(fn (Price $price): string => $price->priceSource->name ?? 'Nhập tay')
                        ->unique()->values()->all(),
                ];
            })
            ->sortBy(fn (array $row): array => [$row['product']->category->sort, $row['product']->sort, $row['region']->sort])
            ->values();
    }

    /**
     * Chuỗi giá theo ngày để vẽ biểu đồ. Không chọn khu vực thì gộp mọi khu vực.
     *
     * @return list<array{date: string, min: int, max: int, avg: int}>
     */
    /**
     * @param  'day'|'week'|'month'  $interval  gộp điểm: theo ngày, tuần (ngày Thứ 2) hoặc tháng (ngày 1)
     */
    public function history(int $productId, ?int $regionId, CarbonImmutable $from, CarbonImmutable $to, string $interval = 'day'): array
    {
        $bucket = fn (string $date): string => match ($interval) {
            'week' => CarbonImmutable::parse($date)->startOfWeek()->toDateString(),
            'month' => substr($date, 0, 7).'-01',
            default => substr($date, 0, 10),
        };

        return Price::query()
            ->published()
            ->where('product_id', $productId)
            ->when($regionId, fn (Builder $query, int $id) => $query->where('region_id', $id))
            ->whereBetween('date', [$from->toDateString(), $to->toDateString()])
            ->orderBy('date')
            ->get(['date', 'price_min', 'price_max', 'price_avg'])
            ->groupBy(fn (Price $price): string => $bucket((string) $price->date))
            ->map(fn (Collection $prices, string $date): array => ['date' => $date, ...$this->combine($prices)])
            ->values()
            ->all();
    }

    /** Ngày có giá sớm nhất của mặt hàng (để biết dữ liệu có từ khi nào) */
    public function firstDate(int $productId, ?int $regionId): ?string
    {
        $date = Price::query()
            ->published()
            ->where('product_id', $productId)
            ->when($regionId, fn (Builder $query, int $id) => $query->where('region_id', $id))
            ->min('date');

        return $date ? substr((string) $date, 0, 10) : null;
    }

    /**
     * @param  Collection<int, Price>  $prices
     * @return array{min: int, max: int, avg: int}
     */
    private function combine(Collection $prices): array
    {
        return [
            'min' => (int) $prices->min('price_min'),
            'max' => (int) $prices->max('price_max'),
            'avg' => (int) round($prices->avg('price_avg')),
        ];
    }
}
