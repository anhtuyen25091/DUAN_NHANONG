<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\DealEntryKind;
use App\Enums\DealEntryStatus;
use App\Enums\DealStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\DealStoreRequest;
use App\Http\Resources\DealResource;
use App\Models\Deal;
use App\Models\Product;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Đơn mua bán chung 2 bên. Người tạo đứng 1 bên, chia sẻ mã cho bên kia tham gia.
 */
class DealController extends Controller
{
    private const WITH = ['seller', 'buyer', 'product', 'entries.creator', 'sources.entries', 'sources.seller'];

    /**
     * ?since=ISO: chỉ các đơn thay đổi sau thời điểm đó (app hỏi vài giây 1 lần để báo bên kia vừa ghi / xác nhận).
     */
    public function index(Request $request): JsonResponse
    {
        $since = $request->validate(['since' => ['nullable', 'date']])['since'] ?? null;
        $deals = Deal::query()
            ->forUser($request->user())
            ->when($since, fn ($query) => $query->where('updated_at', '>=', CarbonImmutable::parse($since)->setTimezone(config('app.timezone'))))
            ->with(self::WITH)
            ->latest('updated_at')
            ->limit(200)
            ->get();

        return response()->json(['data' => $deals->map(function (Deal $deal) use ($request): array {
            $resource = new DealResource($deal);
            $resource->withEntries = false;

            return $resource->resolve($request);
        })]);
    }

    public function store(DealStoreRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $data = $request->validated();

        $deal = DB::transaction(function () use ($user, $data): Deal {
            $isBuyer = $data['role'] === 'buyer';
            $deal = new Deal([
                'title' => $data['title'],
                'unit' => $data['unit'] ?? 'kg',
                'note' => $data['note'] ?? null,
                'product_id' => isset($data['product_code']) ? Product::query()->where('code', $data['product_code'])->value('id') : null,
                $isBuyer ? 'seller_name' : 'buyer_name' => $data['counterpart_name'] ?? null,
            ]);
            $deal->created_by = $user->id;
            $deal->{$isBuyer ? 'buyer_id' : 'seller_id'} = $user->id;
            $deal->status = DealStatus::Open;
            $deal->save();

            if (! empty($data['deposit'])) {
                $entry = $deal->entries()->make(['kind' => DealEntryKind::Deposit, 'date' => $data['deposit_date'] ?? today()->toDateString(), 'amount' => $data['deposit']]);
                $entry->created_by = $user->id;
                $entry->status = DealEntryStatus::Pending;
                $entry->save();
            }

            return $deal;
        });

        return response()->json(['data' => $this->present($deal, $request)], 201);
    }

    public function show(Request $request, Deal $deal): JsonResponse
    {
        $this->authorizeParticipant($request, $deal);

        return response()->json(['data' => $this->present($deal, $request)]);
    }

    /**
     * Sửa tên đơn / ghi chú / tên bên kia (khi chưa tham gia); kết thúc hoặc mở lại đơn.
     */
    public function update(Request $request, Deal $deal): JsonResponse
    {
        $this->authorizeParticipant($request, $deal);
        $data = $request->validate([
            'title' => ['sometimes', 'string', 'max:120'],
            'note' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'counterpart_name' => ['sometimes', 'nullable', 'string', 'max:120'],
            'status' => ['sometimes', Rule::enum(DealStatus::class)],
        ]);

        if (array_key_exists('counterpart_name', $data)) {
            $deal->{$deal->roleOf($request->user()) === 'buyer' ? 'seller_name' : 'buyer_name'} = $data['counterpart_name'];
        }
        $deal->fill(collect($data)->only(['title', 'note'])->all());
        if (isset($data['status'])) {
            $deal->status = DealStatus::from($data['status']);
            $deal->closed_at = $deal->status === DealStatus::Open ? null : now();
        }
        $deal->save();
        if (isset($data['status'])) {
            $deal->recordActivity($request->user(), match ($deal->status) {
                DealStatus::Done => 'đã kết thúc đơn',
                DealStatus::Cancelled => 'đã hủy đơn',
                DealStatus::Open => 'đã mở lại đơn',
            });
        }

        return response()->json(['data' => $this->present($deal, $request)]);
    }

    /**
     * Xóa đơn: chỉ người tạo, khi bên kia chưa tham gia (đã tham gia thì chuyển sang "đã hủy").
     */
    public function destroy(Request $request, Deal $deal): Response
    {
        $this->authorizeParticipant($request, $deal);
        if ($deal->created_by !== $request->user()->id || ! $deal->isOpenToJoin()) {
            abort(422, 'Bên kia đã tham gia: không xóa được, hãy chuyển đơn sang "Đã hủy".');
        }
        $deal->delete();

        return response()->noContent();
    }

    /**
     * Tham gia đơn bằng mã: vào bên còn trống.
     */
    public function join(Request $request): JsonResponse
    {
        $code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) $request->validate(['code' => ['required', 'string', 'max:20']])['code']));
        /** @var User $user */
        $user = $request->user();

        $deal = DB::transaction(function () use ($code, $user): Deal {
            $deal = Deal::query()->where('code', $code)->lockForUpdate()->first();
            if ($deal === null) {
                throw ValidationException::withMessages(['code' => 'Không tìm thấy đơn với mã này. Kiểm tra lại mã.']);
            }
            if ($deal->isParticipant($user)) {
                return $deal;
            }
            if (! $deal->isOpenToJoin()) {
                throw ValidationException::withMessages(['code' => 'Đơn này đã đủ 2 bên.']);
            }
            $deal->{$deal->seller_id === null ? 'seller_id' : 'buyer_id'} = $user->id;
            $deal->save();
            $deal->recordActivity($user, 'đã tham gia đơn');

            return $deal;
        });

        return response()->json(['data' => $this->present($deal, $request)]);
    }

    /**
     * Thương lái nối đơn bán (cho chi nhánh) với các đơn mua (của nông dân) để tính lời cả lô.
     */
    public function sources(Request $request, Deal $deal): JsonResponse
    {
        $this->authorizeParticipant($request, $deal);
        $user = $request->user();
        if ($deal->seller_id !== $user->id) {
            abort(403, 'Chỉ bên bán của đơn này mới gộp được đơn mua.');
        }
        $uuids = $request->validate(['buy_deals' => ['present', 'array'], 'buy_deals.*' => ['uuid']])['buy_deals'];
        $buyDeals = Deal::query()->whereIn('uuid', $uuids)->where('buyer_id', $user->id)->where('id', '!=', $deal->id)->pluck('id');
        if ($buyDeals->count() !== count(array_unique($uuids))) {
            throw ValidationException::withMessages(['buy_deals' => 'Chỉ gộp được các đơn mà bạn là bên mua.']);
        }
        $deal->sources()->sync($buyDeals);

        return response()->json(['data' => $this->present($deal, $request)]);
    }

    private function authorizeParticipant(Request $request, Deal $deal): void
    {
        abort_unless($deal->isParticipant($request->user()), 404);
    }

    /**
     * @return array<string, mixed>
     */
    private function present(Deal $deal, Request $request): array
    {
        return (new DealResource($deal->fresh(self::WITH)))->resolve($request);
    }
}
