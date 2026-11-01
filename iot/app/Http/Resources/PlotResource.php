<?php

namespace App\Http\Resources;

use App\Models\Plot;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Plot
 */
class PlotResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'farm_id' => $this->farm_id,
            'name' => $this->name,
            'type' => $this->type,
            'type_label' => $this->type->getLabel(),
            'crop' => $this->crop,
            'area_m2' => $this->area_m2,
        ];
    }
}
