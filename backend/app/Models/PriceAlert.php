<?php

namespace App\Models;

use App\Enums\AlertCondition;
use Database\Factories\PriceAlertFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Đăng ký nhận báo giá. region_id null = theo dõi giá trung bình mọi khu vực.
 *
 * @property string|null $last_notified_date dạng Y-m-d
 */
#[Fillable(['product_id', 'region_id', 'condition', 'threshold', 'is_triggered', 'last_notified_date', 'last_notified_at'])]
class PriceAlert extends Model
{
    /** @use HasFactory<PriceAlertFactory> */
    use HasFactory;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'condition' => AlertCondition::class,
            'threshold' => 'integer',
            'is_triggered' => 'boolean',
            'last_notified_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<Device, $this>
     */
    public function device(): BelongsTo
    {
        return $this->belongsTo(Device::class);
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
}
