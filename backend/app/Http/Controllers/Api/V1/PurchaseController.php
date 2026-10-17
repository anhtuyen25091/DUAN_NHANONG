<?php

namespace App\Http\Controllers\Api\V1;

use App\Documents\TransactionDocuments;
use App\Enums\PurchaseKind;
use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Deal;
use App\Models\Purchase;
use App\Models\PurchaseVersion;
use App\Models\User;
use App\Notifications\PushNotifier;
use App\Transactions\TransactionFeed;
use Carbon\CarbonImmutable;
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
        $businessId = $this->businessIdFor($user);
        $data = $this->validated($request);

        $purchase = DB::transaction(function () use ($user, $data, $businessId): Purchase {
            $customer = $this->customerFor($user, $data, $businessId);
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
            // Lái con của doanh nghiệp lập phiếu: phiếu thuộc doanh nghiệp (chủ thấy, thống kê)
            $purchase->business_id = $businessId;
            $purchase->customer_id = $customer?->id;
            $purchase->save();

            return $purchase;
        });

        return response()->json(['data' => self::present($purchase->fresh('customer'))], 201);
    }

    public function show(Request $request, Purchase $purchase): JsonResponse
    {
        // Chủ doanh nghiệp xem phiếu lái con lập: chỉ xem (có lịch sử sửa), không sửa / chia sẻ thay lái
        if ($purchase->user_id !== $request->user()->id && $purchase->isBusinessOwner($request->user())) {
            return response()->json(['data' => [...self::present($purchase->load('customer', 'user')), 'can_edit' => false, 'history' => $purchase->history(), 'shared_version' => $purchase->shared_version]]);
        }
        $this->authorizeOwner($request, $purchase);

        return response()->json(['data' => self::present($purchase->load('customer'), withSharing: true)]);
    }

    /** Tạo mã chia sẻ (đã có thì giữ mã cũ) để gửi khách qua Zalo */
    public function share(Request $request, Purchase $purchase): JsonResponse
    {
        $this->authorizeOwner($request, $purchase);
        if ($purchase->share_code === null) {
            $purchase->forceFill(['share_code' => Deal::newCode()])->saveQuietly();
        }
        $purchase->markShared();

        return response()->json(['data' => self::present($purchase->load('customer'), withSharing: true)]);
    }

    /**
     * Thu hồi mã: người khác không nhập mã được nữa. Khách đã nhận vẫn giữ phiếu và lịch sử sửa
     * (để người lập không thu hồi rồi sửa lén).
     */
    public function unshare(Request $request, Purchase $purchase): JsonResponse
    {
        $this->authorizeOwner($request, $purchase);
        $purchase->forceFill(['share_code' => null])->saveQuietly();

        return response()->json(['data' => self::present($purchase->load('customer'), withSharing: true)]);
    }

    /** Gửi thẳng vào app của khách: chỉ khi SĐT khách trên phiếu trùng 1 tài khoản (người lập phiếu bấm mới gửi) */
    public function sendToAccount(Request $request, Purchase $purchase): JsonResponse
    {
        $this->authorizeOwner($request, $purchase);
        $account = $purchase->matchingAccount();
        if ($account === null) {
            throw ValidationException::withMessages(['customer_phone' => 'Số điện thoại khách chưa có tài khoản Nhà Nông. Hãy gửi mã cho khách.']);
        }
        $purchase->viewers()->syncWithoutDetaching([$account->id => ['via' => 'phone']]);
        $purchase->markShared();
        PushNotifier::later([$account->id], '📄 Phiếu mới từ '.$request->user()->name, self::pushSummary($purchase), ['purchaseId' => $purchase->uuid]);

        return response()->json(['data' => self::present($purchase->load('customer'), withSharing: true), 'message' => 'Đã gửi phiếu vào app của '.$account->name]);
    }

    /** Khách nhập mã để nhận phiếu (chỉ xem) */
    public function receive(Request $request): JsonResponse
    {
        $code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) $request->validate(['code' => ['required', 'string', 'max:20']])['code']));
        $purchase = Purchase::query()->where('share_code', $code)->first();
        if ($purchase === null) {
            throw ValidationException::withMessages(['code' => 'Không tìm thấy phiếu với mã này. Kiểm tra lại mã.']);
        }
        if ($purchase->user_id !== $request->user()->id) {
            $purchase->viewers()->syncWithoutDetaching([$request->user()->id => ['via' => 'code']]);
        }

        return response()->json(['data' => self::presentForViewer($purchase)]);
    }

    /** Các phiếu người khác gửi cho mình (kể cả phiếu người lập đã xóa: vẫn giữ để đối chiếu) */
    /**
     * ?since=ISO: chỉ các phiếu mới đổi / mới được gửi sau thời điểm đó (app hỏi 8 giây 1 lần để báo khách)
     */
    public function received(Request $request): JsonResponse
    {
        $since = $request->validate(['since' => ['nullable', 'date']])['since'] ?? null;
        $since = $since ? CarbonImmutable::parse($since)->setTimezone(config('app.timezone')) : null;
        $userId = $request->user()->id;

        $purchases = Purchase::query()
            ->withTrashed()
            ->whereHas('viewers', fn ($q) => $q->whereKey($userId))
            ->when($since, fn ($q) => $q->where(fn ($w) => $w
                ->where('updated_at', '>=', $since)
                ->orWhereHas('viewers', fn ($v) => $v->whereKey($userId)->where('purchase_viewers.created_at', '>=', $since))))
            ->with(['user.buyer', 'viewers' => fn ($q) => $q->whereKey($userId), 'versions'])
            ->latest('date')
            ->limit(200)
            ->get();

        return response()->json(['data' => $purchases->map(fn (Purchase $p): array => self::presentForViewer($p))->values()]);
    }

    public function showReceived(Request $request, string $purchase): JsonResponse
    {
        $purchase = Purchase::withTrashed()->where('uuid', $purchase)->firstOrFail();
        abort_unless($purchase->viewers()->whereKey($request->user()->id)->exists(), 404);

        return response()->json(['data' => self::presentForViewer($purchase)]);
    }

    public function update(Request $request, Purchase $purchase): JsonResponse
    {
        $this->authorizeOwner($request, $purchase);
        $data = $this->validated($request, updating: true);

        DB::transaction(function () use ($request, $purchase, $data): void {
            if (! empty($data['customer']) || ! empty($data['customer_name'])) {
                $customer = $this->customerFor($request->user(), $data, $purchase->business_id);
                $purchase->customer_id = $customer?->id;
                $purchase->customer_name = $customer?->name ?? $data['customer_name'] ?? $purchase->customer_name;
                $purchase->customer_phone = $customer?->phone ?? ($data['customer_phone'] ?? null);
            }
            $purchase->fill(collect($data)->only(['date', 'lines', 'paid', 'note'])->all());
            $purchase->save();
        });

        // Khách đã nhận phiếu: báo phiếu vừa được sửa
        $viewers = $purchase->viewers()->pluck('users.id');
        if ($viewers->isNotEmpty()) {
            PushNotifier::later($viewers, '✏️ '.$request->user()->name.' vừa sửa phiếu', self::pushSummary($purchase), ['purchaseId' => $purchase->uuid]);
        }

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
    /** Dòng tóm tắt phiếu trong thông báo: ngày, số tiền */
    private static function pushSummary(Purchase $p): string
    {
        $amount = (int) $p->amount;

        return 'Phiếu '.$p->code().' ngày '.$p->date->format('d/m/Y').($amount > 0 ? ' · '.number_format($amount, 0, ',', '.').' đ' : '');
    }

    public static function present(Purchase $p, bool $withSharing = false): array
    {
        $data = [
            ...collect(TransactionFeed::fromPurchase($p))->except('sort')->all(),
            'number' => $p->number,
            'version' => $p->version,
            'can_edit' => true,
            'created_by' => ['id' => $p->user_id, 'name' => $p->user?->name],
            'business' => $p->business_id ? $p->business?->name : null,
            // Dòng hàng đầy đủ (cân, trừ bì, tịnh) để sửa phiếu
            'lines' => $p->lines,
            'customer_address' => $p->customer?->address,
        ];
        if (! $withSharing) {
            return $data;
        }

        $viewers = $p->viewers()->get();
        $match = $p->matchingAccount();

        return [
            ...$data,
            'share_code' => $p->share_code,
            'shared_version' => $p->shared_version,
            'history' => $p->history(),
            'shared_with' => $viewers->map(fn (User $u): array => ['name' => $u->name, 'phone' => $u->phone, 'via' => $u->pivot->via])->values()->all(),
            // SĐT khách trùng tài khoản mà chưa gửi: gợi ý nút "Gửi vào app của khách"
            'account_match' => $match && ! $viewers->contains('id', $match->id) ? ['name' => $match->name, 'phone' => $match->phone] : null,
        ];
    }

    /**
     * Phiếu nhìn từ phía khách: ai lập phiếu, mình bán hay mua (ngược với người lập)
     *
     * @return array<string, mixed>
     */
    public static function presentForViewer(Purchase $p): array
    {
        $owner = $p->user;

        return [
            'id' => $p->uuid,
            'code' => $p->code(),
            'date' => $p->date->toDateString(),
            // Người lập phiếu mua vào = mình bán ra
            'kind' => $p->kind === PurchaseKind::Buy ? 'sell' : 'buy',
            'issuer' => ['name' => $owner->buyer?->name ?? $owner->name, 'phone' => $owner->buyer?->phone ?? $owner->phone],
            'customer_name' => $p->customer_name,
            'lines' => $p->lines,
            'kg' => $p->kg,
            'amount' => $p->amount,
            'paid' => $p->paid,
            'owing' => $p->owing(),
            'note' => $p->note,
            'updated_at' => $p->updated_at?->toIso8601String(),
            'version' => $p->version,
            // Bản lúc mình nhận và các lần sửa sau đó
            'history' => $p->history($p->shared_version ?? 1),
            'edited_after_share' => $p->version > ($p->shared_version ?? $p->version),
            'deleted_at' => $p->deleted_at?->toIso8601String(),
            'activity' => self::viewerActivity($p),
        ];
    }

    /**
     * Việc mới nhất về phiếu, nhìn từ phía khách (app báo khi khách đang mở app):
     * được gửi vào app, phiếu bị sửa sau khi mình nhận, phiếu bị xóa. Tự nhập mã thì là việc của mình (by_me).
     *
     * @return array{text: string, at: string, by_me: bool}|null
     */
    private static function viewerActivity(Purchase $p): ?array
    {
        $pivot = $p->relationLoaded('viewers') ? $p->viewers->first()?->pivot : null;
        if ($pivot === null) {
            return null;
        }
        $by = $p->user->buyer?->name ?? $p->user->name;
        $code = $p->code();
        $received = CarbonImmutable::parse($pivot->created_at);

        if ($p->deleted_at !== null) {
            return ['text' => "{$by} đã xóa phiếu {$code}", 'at' => $p->deleted_at->toIso8601String(), 'by_me' => false];
        }

        $latest = $p->versions->sortByDesc('version')->first();
        if ($latest && $latest->version > ($p->shared_version ?? $latest->version) && $latest->created_at > $received) {
            $previous = $p->versions->firstWhere('version', $latest->version - 1);
            $changes = $previous ? array_slice(PurchaseVersion::changes($previous->data, $latest->data), 0, 2) : [];

            return ['text' => "{$by} sửa phiếu {$code}".($changes ? ': '.implode('; ', $changes) : ''), 'at' => $latest->created_at->toIso8601String(), 'by_me' => false];
        }

        return [
            'text' => $pivot->via === 'phone' ? "{$by} gửi phiếu {$code} cho bạn (".TransactionDocuments::vnd($p->amount).')' : "Bạn đã nhận phiếu {$code}",
            'at' => $received->toIso8601String(),
            'by_me' => $pivot->via !== 'phone',
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
    private function customerFor(User $user, array $data, ?int $businessId = null): ?Customer
    {
        // Doanh nghiệp: dùng chung sổ khách cả doanh nghiệp (nông dân bán cho 2 lái vẫn là 1 khách)
        $scope = fn ($q) => $businessId ? $q->where('business_id', $businessId) : $q->where('user_id', $user->id);
        if (! empty($data['customer'])) {
            $customer = Customer::query()->where($scope)->where('uuid', $data['customer'])->first();
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

        $existing = Customer::query()->where($scope)
            ->when($phone, fn ($q) => $q->where('phone', $phone), fn ($q) => $q->where('name', $name)->whereNull('phone'))
            ->first();

        if ($existing !== null) {
            return $existing;
        }
        $customer = new Customer(['name' => $name, 'phone' => $phone]);
        $customer->user_id = $user->id;
        $customer->business_id = $businessId;
        $customer->save();

        return $customer;
    }

    /** Doanh nghiệp của người lập phiếu; tài khoản bị chủ khóa thì không lập phiếu được */
    private function businessIdFor(User $user): ?int
    {
        $membership = $user->membership()->first();
        abort_if($membership !== null && ! $membership->isActive(), 403, 'Tài khoản đã bị chủ doanh nghiệp khóa, chưa lập phiếu được. Hãy liên hệ chủ.');

        return $membership?->business_id;
    }

    private function authorizeOwner(Request $request, Purchase $purchase): void
    {
        abort_unless($purchase->user_id === $request->user()->id, 404);
    }
}
