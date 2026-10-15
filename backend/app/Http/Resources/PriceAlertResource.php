<?php

namespace App\Http\Resources;

use App\Models\PriceAlert;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin PriceAlert
 */
class PriceAlertResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'product' => new ProductResource($this->whenLoaded('product')),
            'region' => $this->region ? new RegionResource($this->region) : null,
            'condition' => $this->condition->value,
            'condition_label' => $this->condition->getLabel(),
            'threshold' => $this->threshold,
            'last_notified_at' => $this->last_notified_at?->toIso8601String(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
