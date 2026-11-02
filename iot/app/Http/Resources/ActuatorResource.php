<?php

namespace App\Http\Resources;

use App\Models\Actuator;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Actuator
 */
class ActuatorResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'device_id' => $this->device_id,
            'device_name' => $this->device->name,
            'device_online' => $this->device->isOnline(),
            'plot_id' => $this->plot_id,
            'name' => $this->name,
            'kind' => $this->kind,
            'kind_label' => $this->kind->getLabel(),
            'irrigation_mode' => $this->irrigation_mode,
            'wets_canopy' => $this->wetsCanopy(),
            'channel' => $this->channel,
            'max_minutes' => $this->max_minutes,
            'is_on' => $this->is_on,
            'state_changed_at' => $this->state_changed_at?->toIso8601String(),
            'auto_off_at' => $this->auto_off_at?->toIso8601String(),
            // Khóa an toàn: cảm biến nguồn nước vượt mức thì không bơm
            'block' => $this->hasInterlock() ? [
                'device_id' => $this->block_device_id,
                'device_name' => $this->blockDevice?->name,
                'metric' => $this->blockMetric?->code,
                'metric_name' => $this->blockMetric?->name,
                'unit' => $this->blockMetric?->unit,
                'operator' => $this->block_operator,
                'value' => $this->block_value,
            ] : null,
            // Lệnh đang chờ mạch làm (app hiện "Đang gửi lệnh…")
            'pending' => $this->openCommand === null ? null : [
                'id' => $this->openCommand->id,
                'action' => $this->openCommand->action,
                'minutes' => $this->openCommand->minutes,
                'status' => $this->openCommand->status,
                'expires_at' => $this->openCommand->expires_at->toIso8601String(),
            ],
        ];
    }
}
