<?php

namespace App\Http\Resources;

use App\Models\ActuatorSchedule;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin ActuatorSchedule
 */
class ScheduleResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'actuator' => ['id' => $this->actuator->id, 'name' => $this->actuator->name],
            'start_time' => $this->startsAt(),
            'minutes' => $this->minutes,
            'every_days' => $this->every_days,
            'months' => $this->months,
            'skip_rain_mm' => $this->skip_rain_mm,
            'note' => $this->note,
            'enabled' => $this->enabled,
            'next_run_on' => $this->next_run_on->toDateString(),
            'last_run_at' => $this->last_run_at?->toIso8601String(),
        ];
    }
}
