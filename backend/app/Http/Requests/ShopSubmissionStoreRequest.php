<?php

namespace App\Http\Requests;

use App\Enums\ShopType;
use App\Support\Provinces;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ShopSubmissionStoreRequest extends FormRequest
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
            // Có shop_id = báo sửa thông tin điểm đã có
            'shop_id' => ['nullable', 'required_if_accepted:remove', 'integer', 'exists:shops,id'],
            // Chủ điểm xin gỡ điểm khỏi danh sách: cần số điện thoại để kiểm tra lại
            'remove' => ['sometimes', 'boolean'],
            'remove_reason' => ['required_if_accepted:remove', 'nullable', Rule::in(['owner', 'closed', 'other'])],
            'contact' => ['required_if_accepted:remove', 'nullable', 'string', 'max:50', 'regex:/^[0-9+().\s\-]{8,}$/'],
            'name' => ['required_without:shop_id', 'nullable', 'string', 'max:255'],
            'types' => ['required_without:shop_id', 'array', 'min:1'],
            'types.*' => [Rule::enum(ShopType::class)],
            'address' => ['nullable', 'string', 'max:255'],
            'province_code' => ['nullable', Rule::in(array_keys(Provinces::options()))],
            'phone' => ['nullable', 'string', 'max:50', 'regex:/^[0-9+().\s\-]{8,}$/'],
            'goods' => ['nullable', 'string', 'max:255'],
            'lat' => ['nullable', 'required_with:lng', 'numeric', 'between:8,24'],
            'lng' => ['nullable', 'required_with:lat', 'numeric', 'between:102,110'],
            'note' => ['nullable', 'string', 'max:500'],
        ];
    }
}
