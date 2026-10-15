<?php

namespace App\Http\Requests;

use App\Enums\DealEntryKind;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Ghi / sửa 1 mục của đơn mua bán. Đợt cân: nhiều dòng hàng (loại, kg, giá), tiền hàng tự tính.
 */
class DealEntryRequest extends FormRequest
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
        $isCut = $this->input('kind', $this->route('entry')?->kind?->value) === DealEntryKind::Cut->value;

        return [
            'kind' => [$this->isMethod('POST') ? 'required' : 'prohibited', Rule::enum(DealEntryKind::class)],
            'date' => ['required', 'date_format:Y-m-d'],
            'lines' => [$isCut ? 'required' : 'prohibited', 'array', 'min:1', 'max:20'],
            'lines.*.grade' => ['required', 'string', 'max:40'],
            'lines.*.kg' => ['required', 'numeric', 'gt:0', 'max:10000000'],
            'lines.*.price' => ['required', 'integer', 'gt:0', 'max:100000000'],
            'amount' => [$isCut ? 'prohibited' : 'required', 'integer', 'gt:0', 'max:100000000000'],
            'deposit_deduct' => ['nullable', 'integer', 'min:0'],
            'paid' => ['nullable', 'integer', 'min:0'],
            'note' => ['nullable', 'string', 'max:255'],
        ];
    }

    public function messages(): array
    {
        return [
            'lines.required' => 'Cần ghi ít nhất 1 loại hàng.',
            'lines.*.kg.gt' => 'Số kg phải lớn hơn 0.',
            'lines.*.price.gt' => 'Cần ghi giá.',
            'amount.gt' => 'Số tiền phải lớn hơn 0.',
        ];
    }

    /**
     * Dữ liệu đã chuẩn hóa để lưu: đợt cân tính sẵn tiền hàng và tổng kg.
     *
     * @return array<string, mixed>
     */
    public function entryData(): array
    {
        $data = $this->safe()->only(['kind', 'date', 'note']);
        if (! $this->has('lines')) {
            return [...$data, 'amount' => (int) $this->validated('amount')];
        }

        $lines = array_map(fn (array $line): array => [
            'grade' => trim($line['grade']),
            'kg' => (float) $line['kg'],
            'price' => (int) $line['price'],
        ], $this->validated('lines'));
        $amount = (int) array_sum(array_map(fn (array $line): int => (int) round($line['kg'] * $line['price']), $lines));
        $deduct = (int) ($this->validated('deposit_deduct') ?? 0);
        $paid = (int) ($this->validated('paid') ?? 0);

        return [
            ...$data,
            'lines' => $lines,
            'amount' => $amount,
            'kg' => array_sum(array_column($lines, 'kg')),
            'deposit_deduct' => min($deduct, $amount),
            'paid' => min($paid, max(0, $amount - $deduct)),
        ];
    }
}
