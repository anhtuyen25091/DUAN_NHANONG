<?php

namespace App\Http\Requests;

use App\Enums\AlertCondition;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class PriceAlertStoreRequest extends FormRequest
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
            'product' => ['required', 'string', Rule::exists('products', 'code')->where('is_active', true)],
            'region' => ['nullable', 'string', 'exists:regions,code'],
            'condition' => ['required', Rule::enum(AlertCondition::class)],
            'threshold' => [
                Rule::requiredIf(fn (): bool => $this->input('condition') !== AlertCondition::Change->value),
                Rule::prohibitedIf(fn (): bool => $this->input('condition') === AlertCondition::Change->value),
                'nullable', 'integer', 'min:1', 'max:1000000000',
            ],
        ];
    }
}
