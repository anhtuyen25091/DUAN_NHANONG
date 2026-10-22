<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

/**
 * Giá 1 điểm mua / lái trả cho 1 lần chào bán (mỗi người 1 giá, sửa được tới khi nông dân chọn).
 */
#[Fillable(['price', 'quantity_kg', 'note'])]
class OfferBid extends Model
{
    public const PENDING = 'pending';

    public const ACCEPTED = 'accepted';

    public const DECLINED = 'declined';

    public const WITHDRAWN = 'withdrawn';

    protected function casts(): array
    {
        return ['price' => 'integer', 'quantity_kg' => 'float'];
    }

    protected static function booted(): void
    {
        static::creating(function (OfferBid $bid): void {
            $bid->uuid ??= (string) Str::uuid();
        });
    }

    public function getRouteKeyName(): string
    {
        return 'uuid';
    }

    /**
     * @return BelongsTo<ProduceOffer, $this>
     */
    public function offer(): BelongsTo
    {
        return $this->belongsTo(ProduceOffer::class, 'produce_offer_id');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
