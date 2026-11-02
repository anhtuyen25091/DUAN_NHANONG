<?php

namespace App\Models;

use App\Enums\PlotType;
use Database\Factories\PlotFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Lô / ruộng / ao trong trang trại. Ngưỡng cảnh báo đặt theo lô.
 */
#[Fillable(['farm_id', 'name', 'type', 'crop', 'area_m2', 'ledger_garden_id', 'ledger_garden_name'])]
class Plot extends Model
{
    /** @use HasFactory<PlotFactory> */
    use HasFactory;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'type' => PlotType::class,
            'area_m2' => 'integer',
        ];
    }

    /**
     * @return BelongsTo<Farm, $this>
     */
    public function farm(): BelongsTo
    {
        return $this->belongsTo(Farm::class);
    }

    /**
     * @return HasMany<Device, $this>
     */
    public function devices(): HasMany
    {
        return $this->hasMany(Device::class);
    }

    /**
     * @return HasMany<Threshold, $this>
     */
    public function thresholds(): HasMany
    {
        return $this->hasMany(Threshold::class);
    }

    /**
     * Việc làm vườn (phun thuốc, bón phân, tưới...)
     *
     * @return HasMany<PlotEvent, $this>
     */
    public function events(): HasMany
    {
        return $this->hasMany(PlotEvent::class);
    }

    /**
     * @return HasMany<Actuator, $this>
     */
    public function actuators(): HasMany
    {
        return $this->hasMany(Actuator::class);
    }

    /**
     * @return HasMany<AutomationRule, $this>
     */
    public function rules(): HasMany
    {
        return $this->hasMany(AutomationRule::class);
    }
}
