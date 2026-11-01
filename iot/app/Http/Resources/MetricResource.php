<?php

namespace App\Http\Resources;

use App\Models\Metric;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Metric
 */
class MetricResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'code' => $this->code,
            'name' => $this->name,
            'unit' => $this->unit,
            'group' => $this->group,
            'decimals' => $this->decimals,
        ];
    }
}
