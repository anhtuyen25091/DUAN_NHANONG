<?php

namespace App\Http\Resources;

use App\Models\AutomationRule;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin AutomationRule
 */
class RuleResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'plot_id' => $this->plot_id,
            'metric' => new MetricResource($this->metric),
            'actuator' => ['id' => $this->actuator->id, 'name' => $this->actuator->name],
            'operator' => $this->operator,
            'value' => $this->value,
            'off_value' => $this->off_value,
            'minutes' => $this->minutes,
            'cooldown_minutes' => $this->cooldown_minutes,
            'enabled' => $this->enabled,
            'last_triggered_at' => $this->last_triggered_at?->toIso8601String(),
        ];
    }
}
