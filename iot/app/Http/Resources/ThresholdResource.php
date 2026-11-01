<?php

namespace App\Http\Resources;

use App\Models\Threshold;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Threshold
 */
class ThresholdResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'plot_id' => $this->plot_id,
            'metric' => $this->metric->code,
            'min' => $this->min,
            'max' => $this->max,
            'note' => $this->note,
        ];
    }
}
