<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * "Khi {chỉ số} của lô {dưới|trên} {value} thì bật {thiết bị} {minutes} phút".
 * off_value: chỉ số trở lại mức này thì tắt sớm (VD DO < 4 bật quạt, DO ≥ 5 tắt).
 * cooldown_minutes: 2 lần tự bật cách nhau ít nhất (tránh bật / tắt liên tục khi số đo dao động quanh ngưỡng).
 */
#[Fillable(['plot_id', 'metric_id', 'actuator_id', 'operator', 'value', 'off_value', 'minutes', 'cooldown_minutes', 'enabled'])]
class AutomationRule extends Model
{
    public const BELOW = 'below';

    public const ABOVE = 'above';

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'value' => 'float',
            'off_value' => 'float',
            'minutes' => 'integer',
            'cooldown_minutes' => 'integer',
            'enabled' => 'boolean',
            'last_triggered_at' => 'datetime',
        ];
    }

    public function shouldTurnOn(float $reading): bool
    {
        return $this->operator === self::BELOW ? $reading < $this->value : $reading > $this->value;
    }

    /** Đã trở lại mức an toàn (chỉ khi có off_value) */
    public function shouldTurnOff(float $reading): bool
    {
        if ($this->off_value === null) {
            return false;
        }

        return $this->operator === self::BELOW ? $reading >= $this->off_value : $reading <= $this->off_value;
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
     * @return BelongsTo<Actuator, $this>
     */
    public function actuator(): BelongsTo
    {
        return $this->belongsTo(Actuator::class);
    }
}
