<?php

namespace App\Http\Resources;

use App\Enums\ShopType;
use App\Models\Shop;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Shop
 */
class ShopResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'types' => $this->types->map(fn (ShopType $type): string => $type->value)->values(),
            'address' => $this->address,
            'province' => $this->province_code,
            'province_name' => $this->provinceName(),
            'lat' => $this->lat,
            'lng' => $this->lng,
            'phone' => $this->phone,
            'goods' => $this->goods,
            'opening_hours' => $this->opening_hours,
            'is_verified' => $this->is_verified,
            'source' => $this->source,
            // Có khi tìm theo vị trí
            'distance_km' => $this->when(isset($this->distance_km), fn (): float => round($this->distance_km, 1)),
        ];
    }
}
