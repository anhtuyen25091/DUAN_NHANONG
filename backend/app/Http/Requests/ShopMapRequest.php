<?php

namespace App\Http\Requests;

use App\Enums\ShopType;
use App\Support\Provinces;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Bản đồ điểm bán: khung đang xem (bbox) + mức phóng, cùng bộ lọc với danh sách */
class ShopMapRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            // nam, tây, bắc, đông
            'bbox' => ['required', 'string', 'regex:/^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/'],
            'zoom' => ['required', 'integer', 'min:0', 'max:22'],
            'type' => ['nullable', Rule::enum(ShopType::class)],
            'province' => ['nullable', Rule::in(array_keys(Provinces::options()))],
            'q' => ['nullable', 'string', 'max:100'],
        ];
    }

    /**
     * @return array{0: float, 1: float, 2: float, 3: float} [nam, tây, bắc, đông]
     */
    public function bbox(): array
    {
        [$south, $west, $north, $east] = array_map('floatval', explode(',', (string) $this->validated('bbox')));

        return [min($south, $north), min($west, $east), max($south, $north), max($west, $east)];
    }
}
