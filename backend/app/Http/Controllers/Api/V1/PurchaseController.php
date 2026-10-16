<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\PurchaseKind;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Purchase;
use App\Models\User;
use App\Transactions\TransactionFeed;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Phiếu mua / bán 1 lần của điểm thu mua (khách vãng lai không cần tài khoản).
 * Gõ tên khách mới thì tự lưu vào sổ khách (trùng SĐT, hoặc trùng tên khi không có SĐT, thì dùng lại khách cũ).
 */
class PurchaseController extends Controller
{
    public function store(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $data = $this->validated($request);

        $purchase = DB::transaction(function () use ($user, $data): Purchase {
            $customer = $this->customerFor($user, $data);
            $purchase = new Purchase([
                'kind' => $data['kind'] ?? PurchaseKind::Buy->value,
                'customer_name' => $customer?->name ?? $data['customer_name'],
                'customer_phone' => $customer?->phone ?? ($data['customer_phone'] ?? null),
                'date' => $data['date'],
                'lines' => $data['lines'],
                'paid' => $data['paid'] ?? 0,
                'note' => $data['note'] ?? null,
            ]);
            $purchase->user_id = $user->id;
            $purchase->customer_id = $customer?->id;
            $purchase->save();

            return $purchase;
        });

        return response()->json(['data' => self::present($purchase->fresh('customer'))], 201);
    }

    public function show(Request $request, Purchase $purchase): JsonResponse
    {
        $this->authorizeOwner($request, $purchase);

        return response()->json(['data' => self::present($purchase->load('customer'))]);
    }

    public function update(Request $request, Purchase $purchase): JsonResponse
    {
        $this->authorizeOwner($request, $purchase);
        $data = $this->validated($request, updating: true);

        DB::transaction(function () use ($request, $purchase, $data): void {
            if (! empty($data['customer']) || ! empty($data['customer_name'])) {
                $customer = $this->customerFor($request->user(), $data);
                $purchase->customer_id = $customer?->id;
                $purchase->customer_name = $customer?->name ?? $data['customer_name'] ?? $purchase->customer_name;
                $purchase->customer_phone = $customer?->phone ?? ($data['customer_phone'] ?? null);
            }
            $purchase->fill(collect($data)->only(['date', 'lines', 'paid', 'note'])->all());
            $purchase->save();
        });

        return response()->json(['data' => self::present($purchase->fresh('customer'))]);
    }

    public function destroy(Request $request, Purchase $purchase): Response
    {
        $this->authorizeOwner($request, $purchase);
        $purchase->delete();

        return response()->noContent();
    }

    /**
     * @return array<string, mixed>
     */
    public static function present(Purchase $p): array
    {
        return [
            ...collect(TransactionFeed::fromPurchase($p))->except('sort')->all(),
            'number' => $p->number,
            // Dòng hàng đầy đủ (cân, trừ bì, tịnh) để sửa phiếu
            'lines' => $p->lines,
            'customer_address' => $p->customer?->address,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, bool $updating = false): array
    {
        $sometimes = $updating ? 'sometimes' : 'required';
        $data = $request->validate([
            'kind' => [$updating ? 'prohibited' : 'nullable', Rule::enum(PurchaseKind::class)],
            'customer' => ['nullable', 'uuid'],
            // Sửa phiếu: chỉ đổi khách khi gửi customer / customer_name
            'customer_name' => ['nullable', $updating ? 'string' : 'required_without:customer', 'string', 'max:120'],
            'customer_phone' => ['nullable', 'string', 'max:20'],
            'date' => [$sometimes, 'date_format:Y-m-d', 'before_or_equal:today'],
            'lines' => [$sometimes, 'array', 'min:1', 'max:30'],
            'lines.*.product_code' => ['nullable', 'string', 'exists:products,code'],
            'lines.*.name' => ['required', 'string', 'max:120'],
            'lines.*.kg' => ['required', 'numeric', 'gt:0', 'max:10000000'],
            'lines.*.deduct_kg' => ['nullable', 'numeric', 'min:0', 'lte:lines.*.kg'],
            'lines.*.price' => ['required', 'integer', 'min:0', 'max:1000000000'],
            'paid' => ['nullable', 'integer', 'min:0'],
            'note' => ['nullable', 'string', 'max:500'],
        ], [
            'customer_name.required_without' => 'Hãy nhập tên khách.',
            'lines.min' => 'Phiếu cần ít nhất 1 dòng hàng.',
            'lines.*.deduct_kg.lte' => 'Trừ bì không được lớn hơn số kg cân.',
            'date.before_or_equal' => 'Ngày lập phiếu không được sau hôm nay.',
        ]);

        // Đã trả không vượt tổng tiền phiếu
        $lines = $data['lines'] ?? null;
        if ($lines !== null && isset($data['paid'])) {
            $amount = array_sum(array_column(Purchase::normalizeLines($lines), 'amount'));
            if ($data['paid'] > $amount) {
                throw ValidationException::withMessages(['paid' => 'Số tiền đã trả lớn hơn tổng tiền phiếu.']);
            }
        }

        return $data;
    }

    /**
     * Khách của phiếu: chọn sẵn (uuid), hoặc tên mới → dùng lại khách trùng SĐT / trùng tên, không có thì tạo.
     *
     * @param  array<string, mixed>  $data
     */
    private function customerFor(User $user, array $data): ?Customer
    {
        if (! empty($data['customer'])) {
            $customer = Customer::query()->where('user_id', $user->id)->where('uuid', $data['customer'])->first();
            if ($customer === null) {
                throw ValidationException::withMessages(['customer' => 'Không tìm thấy khách này.']);
            }

            return $customer;
        }

        $name = trim((string) ($data['customer_name'] ?? ''));
        if ($name === '') {
            return null;
        }
        $phone = trim((string) ($data['customer_phone'] ?? '')) ?: null;

        $existing = Customer::query()->where('user_id', $user->id)
            ->when($phone, fn ($q) => $q->where('phone', $phone), fn ($q) => $q->where('name', $name)->whereNull('phone'))
            ->first();

        if ($existing !== null) {
            return $existing;
        }
        $customer = new Customer(['name' => $name, 'phone' => $phone]);
        $customer->user_id = $user->id;
        $customer->save();

        return $customer;
    }

    private function authorizeOwner(Request $request, Purchase $purchase): void
    {
        abort_unless($purchase->user_id === $request->user()->id, 404);
    }
}
