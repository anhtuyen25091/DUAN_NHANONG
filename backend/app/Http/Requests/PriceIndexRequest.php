<?php

namespace App\Http\Requests;

use App\Enums\CategoryType;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class PriceIndexRequest extends FormRequest
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
            'date' => ['nullable', 'date_format:Y-m-d'],
            'type' => ['nullable', Rule::enum(CategoryType::class)],
            'category' => ['nullable', 'string', 'exists:categories,slug'],
            'region' => ['nullable', 'string', 'exists:regions,code'],
            'product' => ['nullable', 'string', 'exists:products,code'],
        ];
    }
}
