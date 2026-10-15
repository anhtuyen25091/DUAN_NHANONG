<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class DeviceUpdateRequest extends FormRequest
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
            // null = máy tắt thông báo
            'push_token' => ['present', 'nullable', 'string', 'max:255', 'regex:/^(ExponentPushToken|ExpoPushToken)\[.+\]$/'],
            'platform' => ['nullable', 'string', 'in:android,ios,web'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'push_token.regex' => 'Push token không phải của Expo.',
        ];
    }
}
