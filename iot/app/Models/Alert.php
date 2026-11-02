<?php

namespace App\Models;

use App\Enums\AlertDirection;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Lần số đo vượt ngưỡng. Mỗi ngưỡng chỉ có 1 cảnh báo đang mở; tự đóng khi số đo về lại trong ngưỡng.
 */
#[Fillable(['threshold_id', 'device_id', 'direction', 'value', 'measured_at', 'resolved_at', 'note'])]
class Alert extends Model
{
    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'direction' => AlertDirection::class,
            'value' => 'float',
            'measured_at' => 'datetime',
            'resolved_at' => 'datetime',
        ];
    }

    /**
     * @param  Builder<Alert>  $query
     */
    public function scopeOpen(Builder $query): void
    {
        $query->whereNull('resolved_at');
    }

    /**
     * @return BelongsTo<Threshold, $this>
     */
    public function threshold(): BelongsTo
    {
        return $this->belongsTo(Threshold::class);
    }

    /**
     * @return BelongsTo<Device, $this>
     */
    public function device(): BelongsTo
    {
        return $this->belongsTo(Device::class);
    }
}
