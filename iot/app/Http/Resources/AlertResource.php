<?php

namespace App\Http\Resources;

use App\Models\Alert;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Alert
 */
class AlertResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $threshold = $this->threshold;

        return [
            'id' => $this->id,
            'plot' => ['id' => $threshold->plot->id, 'name' => $threshold->plot->name, 'farm_id' => $threshold->plot->farm_id],
            'device' => ['id' => $this->device->id, 'name' => $this->device->name],
            'metric' => new MetricResource($threshold->metric),
            'direction' => $this->direction,
            'value' => $this->value,
            'min' => $threshold->min,
            'max' => $threshold->max,
            'measured_at' => $this->measured_at->toIso8601String(),
            'resolved_at' => $this->resolved_at?->toIso8601String(),
            'note' => $this->note,
        ];
    }
}
