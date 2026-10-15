<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class PriceHistoryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'region' => ['nullable', 'string', 'exists:regions,code'],
            // Số ngày muốn xem; server tự cắt theo mức tài khoản (PriceAccess)
            'days' => ['nullable', 'integer', 'min:1', 'max:'.config('nhanong.price_history.max_days')],
            'to' => ['nullable', 'date_format:Y-m-d'],
        ];
    }
}
