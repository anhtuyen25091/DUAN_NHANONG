<?php

namespace App\Models;

use App\Enums\AlertDirection;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Ngưỡng an toàn của 1 chỉ số trên 1 lô (VD: độ mặn ruộng lúa tối đa 4‰, pH ao tôm 7.5–8.5).
 */
#[Fillable(['plot_id', 'metric_id', 'min', 'max', 'note'])]
class Threshold extends Model
{
    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'min' => 'float',
            'max' => 'float',
        ];
    }

    public function check(float $value): ?AlertDirection
    {
        return match (true) {
            $this->min !== null && $value < $this->min => AlertDirection::Below,
            $this->max !== null && $value > $this->max => AlertDirection::Above,
            default => null,
        };
    }

    /**
     * @return BelongsTo<Plot, $this>
     */
    public function plot(): BelongsTo
    {
        return $this->belongsTo(Plot::class);
    }

    /**
     * @return BelongsTo<Metric, $this>
     */
    public function metric(): BelongsTo
    {
        return $this->belongsTo(Metric::class);
    }

    /**
     * @return HasMany<Alert, $this>
     */
    public function alerts(): HasMany
    {
        return $this->hasMany(Alert::class);
    }
}
