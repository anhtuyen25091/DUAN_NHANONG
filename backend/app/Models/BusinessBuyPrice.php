<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Giá mua tối đa chủ chốt cho lái con: 1 mặt hàng, từ 1 ngày (tới lần chốt kế tiếp). max_price null = bỏ giới hạn.
 */
class BusinessBuyPrice extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return ['date' => 'date', 'max_price' => 'integer'];
    }

    /**
     * @return BelongsTo<Business, $this>
     */
    public function business(): BelongsTo
    {
        return $this->belongsTo(Business::class);
    }

    /**
     * @return BelongsTo<Product, $this>
     */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function setter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'set_by');
    }
}
