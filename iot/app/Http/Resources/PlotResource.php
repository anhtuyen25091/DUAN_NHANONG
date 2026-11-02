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
            // Vườn trong Sổ thu chi của chủ trang trại (nhật ký canh tác 2 bên dùng chung)
            'ledger_garden_id' => $this->ledger_garden_id,
            'ledger_garden_name' => $this->ledger_garden_name,
            // Đang cấm vào lô / cách ly thu hoạch / tạm dừng tưới trên tán... (danh sách trang trại, trang lô)
            'work' => $this->when(array_key_exists('work_status', $this->resource->getAttributes()), fn () => $this->resource->getAttribute('work_status')),
        ];
    }
}
