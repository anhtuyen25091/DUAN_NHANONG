<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Purchase;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Khách quen của điểm thu mua / thương lái, kèm tổng mua / bán và còn nợ (từ các phiếu).
 */
class CustomerController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = trim((string) ($request->validate(['q' => ['nullable', 'string', 'max:100']])['q'] ?? ''));
        $customers = Customer::query()
            ->where('user_id', $request->user()->id)
            ->when($q !== '', fn (Builder $query) => $query->where(fn (Builder $w) => $w->where('name', 'like', "%{$q}%")->orWhere('phone', 'like', "%{$q}%")))
            ->with('purchases')
            ->orderBy('name')
            ->limit(500)
            ->get();

        return response()->json(['data' => $customers->map(fn (Customer $c): array => self::present($c))->values()]);
    }

    public function store(Request $request): JsonResponse
    {
        $customer = new Customer($this->validated($request));
        $customer->user_id = $request->user()->id;
        $customer->save();

        return response()->json(['data' => self::present($customer->load('purchases'))], 201);
    }

    public function update(Request $request, Customer $customer): JsonResponse
    {
        $this->authorizeOwner($request, $customer);
        $customer->update($this->validated($request));

        return response()->json(['data' => self::present($customer->load('purchases'))]);
    }

    /** Xóa khách: các phiếu cũ vẫn giữ (đã chép tên / SĐT lúc lập phiếu) */
    public function destroy(Request $request, Customer $customer): Response
    {
        $this->authorizeOwner($request, $customer);
        $customer->delete();

        return response()->noContent();
    }

    /**
     * @return array<string, mixed>
     */
    public static function present(Customer $c): array
    {
        $purchases = $c->purchases;

        return [
            'id' => $c->uuid,
            'name' => $c->name,
            'phone' => $c->phone,
            'address' => $c->address,
            'note' => $c->note,
            'count' => $purchases->count(),
            'bought' => (int) $purchases->where('kind.value', 'buy')->sum('amount'),
            'sold' => (int) $purchases->where('kind.value', 'sell')->sum('amount'),
            // Mình còn nợ khách (phiếu mua chưa trả đủ) / khách còn nợ mình (phiếu bán chưa thu đủ)
            'i_owe' => (int) $purchases->where('kind.value', 'buy')->sum(fn (Purchase $p): int => $p->owing()),
            'owes_me' => (int) $purchases->where('kind.value', 'sell')->sum(fn (Purchase $p): int => $p->owing()),
            'last_date' => $purchases->max(fn (Purchase $p): string => $p->date->toDateString()),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'phone' => ['nullable', 'string', 'max:20'],
            'address' => ['nullable', 'string', 'max:255'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);
    }

    private function authorizeOwner(Request $request, Customer $customer): void
    {
        abort_unless($customer->user_id === $request->user()->id, 404);
    }
}
