<?php

namespace App\Http\Resources;

use App\Models\Device;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Device
 */
class DeviceResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'uid' => $this->uid,
            'farm_id' => $this->farm_id,
            'plot_id' => $this->plot_id,
            'name' => $this->name,
            'kind' => $this->kind,
            'profile' => $this->profile,
            'dev_eui' => $this->dev_eui,
            'battery' => $this->battery,
            'firmware' => $this->firmware,
            'measure_interval_min' => $this->measure_interval_min,
            'online' => $this->isOnline(),
            'last_seen_at' => $this->last_seen_at?->toIso8601String(),
        ];
    }
}
