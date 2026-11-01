<?php

namespace App\Http\Resources;

use App\Models\Farm;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Farm
 */
class FarmResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'province' => $this->province,
            'lat' => $this->lat,
            'lng' => $this->lng,
            'rain_alerts' => $this->rain_alerts,
            // Đang mưa tại vị trí trang trại (dữ liệu thời tiết hoặc máy đo mưa)
            'raining' => $this->raining_since === null ? null : [
                'since' => $this->raining_since->toIso8601String(),
                'mm' => $this->rain_episode_mm,
            ],
            'plots' => PlotResource::collection($this->whenLoaded('plots')),
        ];
    }
}
