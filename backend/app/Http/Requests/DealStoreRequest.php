<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class DealStoreRequest extends FormRequest
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
            // Người tạo đứng bên nào: mua (thương lái / chi nhánh đi mua) hay bán (nông dân / lái bán lại)
            'role' => ['required', 'in:buyer,seller'],
            'title' => ['required', 'string', 'max:120'],
            'counterpart_name' => ['nullable', 'string', 'max:120'],
            'product_code' => ['nullable', 'string', 'exists:products,code'],
            'unit' => ['nullable', 'string', 'max:20'],
            'note' => ['nullable', 'string', 'max:1000'],
            'deposit' => ['nullable', 'integer', 'min:0', 'max:100000000000'],
            'deposit_date' => ['nullable', 'date_format:Y-m-d'],
        ];
    }
}
