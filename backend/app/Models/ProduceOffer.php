<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

/**
 * Nông dân chào bán 1 lô hàng (mặt hàng, số kg, ngày thu hoạch, vị trí vườn) để các điểm mua quanh đó trả giá.
 */
#[Fillable(['product_name', 'quantity_kg', 'expected_price', 'harvest_date', 'province_code', 'lat', 'lng', 'place_label', 'note'])]
class ProduceOffer extends Model
{
    public const OPEN = 'open';

    public const SOLD = 'sold';

    public const CLOSED = 'closed';

    /** Hết hạn nhận giá: sau ngày thu hoạch chừng này ngày */
    public const DAYS_AFTER_HARVEST = 7;

    /** Mỗi tài khoản tối đa chừng này lần chào đang mở */
    public const MAX_OPEN = 20;

    protected function casts(): array
    {
        return [
            'quantity_kg' => 'float',
            'expected_price' => 'integer',
            'harvest_date' => 'date',
            'lat' => 'float',
            'lng' => 'float',
            'expires_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (ProduceOffer $offer): void {
            $offer->uuid ??= (string) Str::uuid();
        });
        static::saving(function (ProduceOffer $offer): void {
            $offer->expires_at = $offer->harvest_date->copy()->addDays(self::DAYS_AFTER_HARVEST)->endOfDay();
        });
    }

    public function getRouteKeyName(): string
    {
        return 'uuid';
    }

    /**
     * Đang nhận giá (chưa chọn giá, chưa đóng, chưa hết hạn)
     *
     * @param  Builder<ProduceOffer>  $query
     */
    public function scopeAcceptingBids(Builder $query): void
    {
        $query->where('status', self::OPEN)->where('expires_at', '>', now());
    }

    public function isAcceptingBids(): bool
    {
        return $this->status === self::OPEN && $this->expires_at->isFuture();
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return BelongsTo<Product, $this>
     */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    /**
     * @return HasMany<OfferBid, $this>
     */
    public function bids(): HasMany
    {
        return $this->hasMany(OfferBid::class);
    }

    /**
     * @return BelongsTo<OfferBid, $this>
     */
    public function acceptedBid(): BelongsTo
    {
        return $this->belongsTo(OfferBid::class, 'accepted_bid_id');
    }
}
