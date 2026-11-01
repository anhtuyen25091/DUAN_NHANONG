<?php

namespace App\Http\Resources;

use App\Models\ActuatorCommand;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin ActuatorCommand
 */
class CommandResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'actuator_id' => $this->actuator_id,
            'action' => $this->action,
            'minutes' => $this->minutes,
            'source' => $this->source,
            'reason' => $this->reason,
            'status' => $this->status,
            'status_label' => $this->status->getLabel(),
            'message' => $this->message,
            'created_at' => $this->created_at->toIso8601String(),
            'done_at' => $this->done_at?->toIso8601String(),
        ];
    }
}
