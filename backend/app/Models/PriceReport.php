<?php

namespace App\Models;

use App\Enums\PriceStatus;
use App\Enums\ReportStatus;
use App\Support\Geo;
use App\Support\Provinces;
use Carbon\CarbonImmutable;
use Database\Factories\PriceReportFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Giá 1 điểm mua đăng cho 1 mặt hàng trong 1 ngày (nông sản: giá thu mua; phân thuốc: giá bán).
 * Hiện ngay; lệch nhiều so với giá tham chiếu quanh đó thì chờ duyệt.
 */
#[Fillable(['buyer_id', 'product_id', 'date', 'price', 'unit', 'province_code', 'lat', 'lng', 'note', 'status', 'reference_price', 'review_reason', 'flags_count'])]
class PriceReport extends Model
{
    /** @use HasFactory<PriceReportFactory> */
    use HasFactory;

    /** Lệch hơn tỷ lệ này so với giá tham chiếu thì chờ duyệt */
    public const MAX_DEVIATION = 0.3;

    /** Bán kính / số ngày lấy giá của các điểm mua khác làm tham chiếu */
    public const REFERENCE_RADIUS_KM = 50;

    public const REFERENCE_DAYS = 14;

    /** Bị báo sai từ chừng này lượt thì chờ duyệt */
    public const FLAGS_TO_REVIEW = 3;

    protected function casts(): array
    {
        return [
            'date' => 'date:Y-m-d',
            'price' => 'integer',
            'lat' => 'float',
            'lng' => 'float',
            'status' => ReportStatus::class,
            'reference_price' => 'integer',
            'flags_count' => 'integer',
        ];
    }

    /**
     * @return BelongsTo<Buyer, $this>
     */
    public function buyer(): BelongsTo
    {
        return $this->belongsTo(Buyer::class);
    }

    /**
     * @return BelongsTo<Product, $this>
     */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    /**
     * @return HasMany<PriceReportFlag, $this>
     */
    public function flags(): HasMany
    {
        return $this->hasMany(PriceReportFlag::class);
    }

    /**
     * @param  Builder<PriceReport>  $query
     */
    public function scopePublished(Builder $query): void
    {
        $query->where('status', ReportStatus::Published);
    }

    /**
     * Giá tham chiếu cho 1 mặt hàng quanh 1 vị trí:
     * 1) giá giữa (median) của các điểm mua khác trong 50 km, 14 ngày gần nhất (cần ít nhất 2 giá);
     * 2) không có thì giá chung (crawl) mới nhất của tỉnh đó trong 14 ngày;
     * 3) không có nữa thì null (không đủ dữ liệu để so).
     *
     * @return array{price: int, source: string}|null
     */
    public static function reference(int $productId, string $provinceCode, float $lat, float $lng, CarbonImmutable $date, ?int $exceptBuyerId = null): ?array
    {
        $from = $date->subDays(self::REFERENCE_DAYS)->toDateString();
        $nearby = Geo::withinBox(self::query()->published(), $lat, $lng, self::REFERENCE_RADIUS_KM)
            ->where('product_id', $productId)
            ->whereBetween('date', [$from, $date->toDateString()])
            ->when($exceptBuyerId, fn (Builder $q, int $id) => $q->where('buyer_id', '!=', $id))
            ->get(['buyer_id', 'price', 'lat', 'lng', 'date'])
            ->filter(fn (self $r): bool => Geo::distanceKm($lat, $lng, $r->lat, $r->lng) <= self::REFERENCE_RADIUS_KM)
            // Mỗi điểm mua chỉ lấy giá mới nhất
            ->sortByDesc('date')
            ->unique('buyer_id')
            ->pluck('price');

        if ($nearby->count() >= 2) {
            return ['price' => (int) round($nearby->median()), 'source' => 'Giá các điểm mua khác trong '.self::REFERENCE_RADIUS_KM.' km'];
        }

        $crawled = self::crawledPrice($productId, $provinceCode, $date);

        return $crawled ? ['price' => $crawled['price'], 'source' => 'Giá chung '.$crawled['region']] : null;
    }

    /**
     * Giá chung (crawl) mới nhất của tỉnh trong 14 ngày: ưu tiên khu vực trùng tên tỉnh, rồi các khu vực cũ thuộc tỉnh.
     *
     * @return array{price: int, region: string, date: string}|null
     */
    public static function crawledPrice(int $productId, ?string $provinceCode, CarbonImmutable $date): ?array
    {
        $province = Provinces::name($provinceCode);
        if ($province === null) {
            return null;
        }

        $price = Price::query()
            ->with('region')
            ->where('product_id', $productId)
            ->where('status', PriceStatus::Published)
            ->whereBetween('date', [$date->subDays(self::REFERENCE_DAYS)->toDateString(), $date->toDateString()])
            ->whereHas('region', fn (Builder $q) => $q->where('province', $province))
            ->get()
            ->sortBy([fn (Price $a, Price $b) => ($b->region->name === $province) <=> ($a->region->name === $province), ['date', 'desc']])
            ->first();

        return $price ? ['price' => (int) $price->price_avg, 'region' => $price->region->name, 'date' => CarbonImmutable::parse($price->date)->toDateString()] : null;
    }
}
