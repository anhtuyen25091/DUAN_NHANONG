<?php

namespace App\Http\Resources;

use App\Models\PlotEvent;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin PlotEvent
 */
class PlotEventResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'uuid' => $this->uuid,
            'plot_id' => $this->plot_id,
            'kind' => $this->kind,
            'kind_label' => PlotEvent::LABELS[$this->kind] ?? $this->kind,
            'title' => $this->title,
            'quantity' => $this->quantity,
            'unit' => $this->unit,
            'target' => $this->target,
            'withholding_days' => $this->withholding_days,
            'reentry_hours' => $this->reentry_hours,
            'rain_free_hours' => $this->rain_free_hours,
            'worker' => $this->worker,
            'note' => $this->note,
            'planned' => $this->planned,
            'done_at' => $this->done_at->toIso8601String(),
            'source' => $this->source,
            'actuator_id' => $this->actuator_id,
            'minutes' => $this->minutes,
            'user' => $this->user ? ['id' => $this->user->id, 'name' => $this->user->name] : null,
            'no_entry_until' => $this->planned ? null : $this->noEntryUntil()?->toIso8601String(),
            'harvest_from' => $this->planned ? null : $this->harvestFrom()?->toDateString(),
            'canopy_paused_until' => $this->planned ? null : $this->canopyPauseUntil()?->toIso8601String(),
            // Đồng bộ với Sổ thu chi: việc đã xóa vẫn trả về (khi hỏi ?since=) để máy xóa theo
            'deleted' => $this->trashed(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
