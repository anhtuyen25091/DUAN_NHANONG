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
            'days' => ['nullable', 'integer', 'in:7,30,90,365'],
            'to' => ['nullable', 'date_format:Y-m-d'],
        ];
    }
}
