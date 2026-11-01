<?php

namespace App\Http\Resources;

use App\Models\Farm;
use App\Services\Irrigation\DrySpell;
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
            'dry_alert_days' => $this->dry_alert_days,
            // Số ngày liên tiếp không mưa tới hôm qua (theo lượng mưa đã lưu)
            'dry_days' => $this->hasLocation() ? app(DrySpell::class)->days($this->resource) : null,
            // Đang mưa tại vị trí trang trại (dữ liệu thời tiết hoặc máy đo mưa)
            'raining' => $this->raining_since === null ? null : [
                'since' => $this->raining_since->toIso8601String(),
                'mm' => $this->rain_episode_mm,
            ],
            // owner / operator (được bật / tắt máy) / viewer (chỉ xem): app ẩn nút sửa khi không phải chủ
            'role' => $this->roleOf($request->user()),
            'owner_name' => $this->whenLoaded('user', fn () => $this->user->name),
            'plots' => PlotResource::collection($this->whenLoaded('plots')),
        ];
    }
}
