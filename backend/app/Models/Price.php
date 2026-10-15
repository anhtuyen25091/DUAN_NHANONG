<?php

namespace App\Models;

use App\Enums\PriceStatus;
use Database\Factories\PriceFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string $date ngày của giá, dạng Y-m-d (không cast để so sánh/khóa unique nhất quán giữa MySQL và SQLite)
 */
#[Fillable([
    'product_id', 'region_id', 'price_source_id', 'date',
    'price_min', 'price_max', 'price_avg', 'unit', 'status', 'note', 'source_url',
])]
class Price extends Model
{
    /** @use HasFactory<PriceFactory> */
    use HasFactory;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'price_min' => 'integer',
            'price_max' => 'integer',
            'price_avg' => 'integer',
            'status' => PriceStatus::class,
        ];
    }

    /**
     * @return BelongsTo<Product, $this>
     */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    /**
     * @return BelongsTo<Region, $this>
     */
    public function region(): BelongsTo
    {
        return $this->belongsTo(Region::class);
    }

    /**
     * @return BelongsTo<PriceSource, $this>
     */
    public function priceSource(): BelongsTo
    {
        return $this->belongsTo(PriceSource::class);
    }

    /**
     * @param  Builder<Price>  $query
     */
    public function scopePublished(Builder $query): void
    {
        $query->where('status', PriceStatus::Published);
    }
}
