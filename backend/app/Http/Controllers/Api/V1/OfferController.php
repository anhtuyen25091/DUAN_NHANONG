<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\BuyerStatus;
use App\Enums\ShopType;
use App\Http\Controllers\Controller;
use App\Models\Buyer;
use App\Models\OfferBid;
use App\Models\ProduceOffer;
use App\Models\Product;
use App\Models\User;
use App\Notifications\PushNotifier;
use App\Support\Geo;
use App\Support\Provinces;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Chào bán: nông dân đăng lô hàng sắp thu hoạch, điểm mua / lái quanh đó trả giá, nông dân chọn 1 giá.
 * Trả giá được: tài khoản có hồ sơ điểm mua đã duyệt, hoặc thuộc 1 doanh nghiệp thu mua (chủ / lái đang dùng).
 * Số điện thoại 2 bên chỉ hiện cho nhau sau khi nông dân chọn giá.
 */
class OfferController extends Controller
{
    public const DEFAULT_RADIUS = 30;

    /** Báo các điểm mua trong chừng này km khi có lô hàng mới */
    public const NOTIFY_RADIUS = 30;

    /** Chợ: các lần chào đang nhận giá quanh 1 vị trí (không gồm lần chào của chính mình) */
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'lat' => ['required', 'numeric', 'between:-90,90'],
            'lng' => ['required', 'numeric', 'between:-180,180'],
            'radius' => ['nullable', 'integer', 'min:1', 'max:200'],
            'product' => ['nullable', 'string', 'exists:products,code'],
        ]);
        $user = $request->user();
        $lat = (float) $data['lat'];
        $lng = (float) $data['lng'];
        $radius = (int) ($data['radius'] ?? self::DEFAULT_RADIUS);

        $offers = Geo::withinBox(ProduceOffer::query()->acceptingBids(), $lat, $lng, $radius)
            ->where('user_id', '!=', $user->id)
            ->when($data['product'] ?? null, fn (Builder $q, string $code) => $q->whereHas('product', fn (Builder $p) => $p->where('code', $code)))
            ->with(['product', 'user', 'bids' => fn ($q) => $q->where('status', OfferBid::PENDING)])
            ->limit(300)
            ->get()
            ->each(fn (ProduceOffer $o) => $o->distance_km = Geo::distanceKm($lat, $lng, $o->lat, $o->lng))
            ->filter(fn (ProduceOffer $o): bool => $o->distance_km <= $radius)
            ->sortBy([['harvest_date', 'asc'], ['distance_km', 'asc']]);

        return response()->json([
            'data' => $offers->map(fn (ProduceOffer $o): array => $this->present($o, $user))->values(),
            'meta' => ['radius_km' => $radius, 'can_bid' => self::canBid($user)],
        ]);
    }

    /** Các lần chào của mình (nông dân), kèm mọi giá được trả */
    public function mine(Request $request): JsonResponse
    {
        $offers = ProduceOffer::query()
            ->where('user_id', $request->user()->id)
            ->with(['product', 'user', 'bids.user.buyer', 'bids.user.membership.business'])
            ->latest()
            ->limit(100)
            ->get();

        return response()->json(['data' => $offers->map(fn (ProduceOffer $o): array => $this->present($o, $request->user()))->values()]);
    }

    /** Các lần mình đã trả giá (điểm mua / lái) */
    public function myBids(Request $request): JsonResponse
    {
        $offers = ProduceOffer::query()
            ->whereHas('bids', fn (Builder $q) => $q->where('user_id', $request->user()->id))
            ->with(['product', 'user', 'bids'])
            ->latest('updated_at')
            ->limit(100)
            ->get();

        return response()->json(['data' => $offers->map(fn (ProduceOffer $o): array => $this->present($o, $request->user()))->values()]);
    }

    public function show(Request $request, ProduceOffer $offer): JsonResponse
    {
        $user = $request->user();
        $isOwner = $offer->user_id === $user->id;
        $hasBid = $offer->bids()->where('user_id', $user->id)->exists();
        // Người khác chỉ xem được lần chào đang nhận giá, hoặc lần mình đã trả giá
        abort_unless($isOwner || $hasBid || $offer->isAcceptingBids(), 404);

        $offer->load(['product', 'user', 'bids.user.buyer', 'bids.user.membership.business']);

        return response()->json(['data' => $this->present($offer, $user)]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        if (ProduceOffer::query()->where('user_id', $user->id)->acceptingBids()->count() >= ProduceOffer::MAX_OPEN) {
            throw ValidationException::withMessages(['product_name' => 'Bạn đang có '.ProduceOffer::MAX_OPEN.' lần chào bán đang mở. Đóng bớt lần cũ trước.']);
        }
        $data = $this->validated($request);

        $offer = new ProduceOffer($data);
        $offer->user_id = $user->id;
        $offer->status = ProduceOffer::OPEN;
        $offer->product_id = $this->productId($data);
        $offer->province_code ??= Provinces::detect($data['place_label'] ?? null);
        $offer->save();

        $this->notifyNearbyBuyers($offer->load('product'));

        return response()->json(['data' => $this->present($offer->load('user'), $user)], 201);
    }

    /** Sửa lô hàng (khi còn nhận giá), hoặc đóng / mở lại (status) */
    public function update(Request $request, ProduceOffer $offer): JsonResponse
    {
        $this->authorizeOwner($request, $offer);
        if ($request->has('status')) {
            $status = $request->validate(['status' => ['required', Rule::in([ProduceOffer::OPEN, ProduceOffer::CLOSED])]])['status'];
            abort_if($offer->status === ProduceOffer::SOLD, 422, 'Lô hàng đã chọn giá, không đổi được.');
            $offer->forceFill(['status' => $status])->save();
        } else {
            abort_unless($offer->status === ProduceOffer::OPEN, 422, 'Lô hàng đã đóng / đã chọn giá, không sửa được.');
            $data = $this->validated($request);
            $offer->fill($data);
            $offer->product_id = $this->productId($data);
            $offer->save();
        }

        return $this->show($request, $offer->refresh());
    }

    public function destroy(Request $request, ProduceOffer $offer): Response
    {
        $this->authorizeOwner($request, $offer);
        $bidders = $offer->bids()->where('status', OfferBid::PENDING)->pluck('user_id');
        $offer->delete();
        PushNotifier::later($bidders, 'Lô hàng đã bị gỡ', "Nông dân đã gỡ lô {$offer->product_name} bạn trả giá.");

        return response()->noContent();
    }

    /** Điểm mua / lái trả giá (hoặc sửa giá đã trả) */
    public function bid(Request $request, ProduceOffer $offer): JsonResponse
    {
        $user = $request->user();
        abort_if($offer->user_id === $user->id, 422, 'Không trả giá cho lô hàng của chính mình.');
        if (! self::canBid($user)) {
            abort(403, 'Chỉ điểm mua đã được duyệt hoặc lái thuộc doanh nghiệp thu mua mới trả giá được. Đăng ký điểm mua ở mục Tài khoản.');
        }
        if (! $offer->isAcceptingBids()) {
            throw ValidationException::withMessages(['price' => 'Lô hàng này đã ngừng nhận giá.']);
        }
        $data = $request->validate([
            'price' => ['required', 'integer', 'min:1', 'max:1000000000'],
            'quantity_kg' => ['nullable', 'numeric', 'gt:0', 'max:10000000'],
            'note' => ['nullable', 'string', 'max:300'],
        ], ['price.min' => 'Hãy nhập giá trả (đ/kg).']);

        $bid = OfferBid::query()->where('produce_offer_id', $offer->id)->where('user_id', $user->id)->first()
            ?? (new OfferBid)->forceFill(['produce_offer_id' => $offer->id, 'user_id' => $user->id]);
        $isNew = ! $bid->exists || $bid->status === OfferBid::WITHDRAWN;
        $bid->fill($data);
        $bid->status = OfferBid::PENDING;
        $bid->save();

        PushNotifier::later(
            [$offer->user_id],
            ($isNew ? '💰 Có người trả giá ' : '✏️ Đổi giá ').$offer->product_name,
            self::bidderName($user).' trả '.number_format($bid->price, 0, ',', '.').' đ/kg',
            ['offerId' => $offer->uuid],
        );

        return $this->show($request, $offer);
    }

    /** Rút giá đã trả */
    public function withdraw(Request $request, ProduceOffer $offer): JsonResponse
    {
        $bid = $offer->bids()->where('user_id', $request->user()->id)->firstOrFail();
        abort_if($bid->status === OfferBid::ACCEPTED, 422, 'Nông dân đã chọn giá của bạn, không rút được. Hãy gọi điện cho nông dân.');
        $bid->forceFill(['status' => OfferBid::WITHDRAWN])->save();

        return $this->show($request, $offer);
    }

    /** Nông dân chọn 1 giá: lô hàng thành "đã chọn giá", các giá khác bị từ chối, 2 bên thấy số điện thoại của nhau */
    public function accept(Request $request, ProduceOffer $offer, OfferBid $bid): JsonResponse
    {
        $this->authorizeOwner($request, $offer);
        abort_unless($bid->produce_offer_id === $offer->id, 404);
        if (! $offer->isAcceptingBids() || $bid->status !== OfferBid::PENDING) {
            throw ValidationException::withMessages(['bid' => 'Không chọn được giá này (lô hàng đã đóng hoặc người mua đã rút giá).']);
        }

        DB::transaction(function () use ($offer, $bid): void {
            $bid->forceFill(['status' => OfferBid::ACCEPTED])->save();
            $offer->bids()->whereKeyNot($bid->id)->where('status', OfferBid::PENDING)->update(['status' => OfferBid::DECLINED]);
            $offer->forceFill(['status' => ProduceOffer::SOLD, 'accepted_bid_id' => $bid->id])->save();
        });

        $farmer = $request->user();
        PushNotifier::later([$bid->user_id], "✅ {$farmer->name} chọn giá của bạn", "{$offer->product_name} ".self::kg($offer->quantity_kg).' · '.number_format($bid->price, 0, ',', '.')." đ/kg. Gọi {$farmer->phone} để hẹn cân.", ['offerId' => $offer->uuid]);
        $others = $offer->bids()->where('status', OfferBid::DECLINED)->pluck('user_id');
        PushNotifier::later($others, "Lô {$offer->product_name} đã bán", 'Nông dân đã chọn giá khác. Cảm ơn bạn đã trả giá.', ['offerId' => $offer->uuid]);

        return $this->show($request, $offer->refresh());
    }

    /** Có hồ sơ điểm mua đã duyệt, hoặc đang trong 1 doanh nghiệp thu mua (không bị khóa) */
    public static function canBid(User $user): bool
    {
        return $user->buyer()->where('status', BuyerStatus::Approved)->exists() || $user->activeMembership() !== null;
    }

    /** Tên hiện cho nông dân: hồ sơ điểm mua, hoặc "Lái Tèo · Công ty Hai Lúa", hoặc tên tài khoản */
    public static function bidderName(User $user): string
    {
        if ($user->buyer?->status === BuyerStatus::Approved) {
            return $user->buyer->name;
        }
        $business = $user->membership?->business;

        return $business ? "{$user->name} · {$business->name}" : $user->name;
    }

    /**
     * @return array<string, mixed>
     */
    private function present(ProduceOffer $o, User $viewer): array
    {
        $isOwner = $o->user_id === $viewer->id;
        $active = $o->bids->filter(fn (OfferBid $b): bool => in_array($b->status, [OfferBid::PENDING, OfferBid::ACCEPTED], true));
        $mine = $o->bids->firstWhere('user_id', $viewer->id);
        $accepted = $o->bids->firstWhere('status', OfferBid::ACCEPTED);
        // Nông dân chọn giá của mình: thấy số nông dân
        $iWon = $accepted !== null && $accepted->user_id === $viewer->id;

        return [
            'id' => $o->uuid,
            'product' => $o->product ? ['code' => $o->product->code, 'name' => $o->product->name] : null,
            'product_name' => $o->product_name,
            'quantity_kg' => $o->quantity_kg,
            'expected_price' => $o->expected_price,
            'harvest_date' => $o->harvest_date->toDateString(),
            'province' => $o->province_code,
            'province_name' => Provinces::name($o->province_code),
            'place_label' => $o->place_label,
            'lat' => $o->lat,
            'lng' => $o->lng,
            'distance_km' => isset($o->distance_km) ? round($o->distance_km, 1) : null,
            'note' => $o->note,
            'status' => $o->isAcceptingBids() || $o->status !== ProduceOffer::OPEN ? $o->status : 'expired',
            'expires_at' => $o->expires_at->toIso8601String(),
            'created_at' => $o->created_at?->toIso8601String(),
            'is_mine' => $isOwner,
            'farmer' => [
                'name' => $o->user?->name,
                'phone' => $isOwner || $iWon ? $o->user?->phone : null,
            ],
            'bids_count' => $active->count(),
            'best_price' => $active->max('price'),
            'my_bid' => $mine && ! $isOwner ? self::presentBid($mine, withContact: false) : null,
            // Nông dân thấy mọi giá (cao trước) và cách liên lạc người mua
            'bids' => $isOwner ? $o->bids->where('status', '!=', OfferBid::WITHDRAWN)->sortByDesc('price')->map(fn (OfferBid $b): array => self::presentBid($b, withContact: true))->values()->all() : null,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private static function presentBid(OfferBid $b, bool $withContact): array
    {
        return [
            'id' => $b->uuid,
            'price' => $b->price,
            'quantity_kg' => $b->quantity_kg,
            'note' => $b->note,
            'status' => $b->status,
            'updated_at' => $b->updated_at?->toIso8601String(),
            'buyer' => $withContact ? [
                'name' => self::bidderName($b->user),
                'verified' => (bool) $b->user->buyer?->is_verified,
                'phone' => $b->user->buyer?->phone ?? $b->user->phone,
            ] : null,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
    {
        return $request->validate([
            'product_code' => ['nullable', 'string', 'exists:products,code'],
            'product_name' => ['required', 'string', 'max:120'],
            'quantity_kg' => ['required', 'numeric', 'gt:0', 'max:10000000'],
            'expected_price' => ['nullable', 'integer', 'min:1', 'max:1000000000'],
            'harvest_date' => ['required', 'date_format:Y-m-d', 'after_or_equal:today', 'before:'.CarbonImmutable::today()->addMonths(6)->toDateString()],
            'province_code' => ['nullable', Rule::in(array_keys(Provinces::options()))],
            'lat' => ['required', 'numeric', 'between:-90,90'],
            'lng' => ['required', 'numeric', 'between:-180,180'],
            'place_label' => ['nullable', 'string', 'max:255'],
            'note' => ['nullable', 'string', 'max:500'],
        ], [
            'harvest_date.after_or_equal' => 'Ngày thu hoạch không được trước hôm nay.',
            'harvest_date.before' => 'Chỉ chào bán lô thu hoạch trong 6 tháng tới.',
            'lat.required' => 'Hãy chọn vị trí vườn (để điểm mua gần đó thấy).',
        ]);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function productId(array $data): ?int
    {
        return empty($data['product_code']) ? null : Product::query()->where('code', $data['product_code'])->value('id');
    }

    /** Báo các điểm mua nông sản đã duyệt quanh vườn */
    private function notifyNearbyBuyers(ProduceOffer $offer): void
    {
        $buyers = Geo::withinBox(Buyer::query()->where('status', BuyerStatus::Approved)->whereNotNull('lat'), $offer->lat, $offer->lng, self::NOTIFY_RADIUS)
            ->where('user_id', '!=', $offer->user_id)
            ->get()
            ->filter(fn (Buyer $b): bool => $b->deals_in?->contains(ShopType::ThuMua) && Geo::distanceKm($offer->lat, $offer->lng, $b->lat, $b->lng) <= self::NOTIFY_RADIUS)
            ->pluck('user_id');

        PushNotifier::later(
            $buyers,
            "🌾 Có lô {$offer->product_name} chào bán gần bạn",
            self::kg($offer->quantity_kg).', thu hoạch '.$offer->harvest_date->format('d/m').($offer->place_label ? " · {$offer->place_label}" : ''),
            ['offerId' => $offer->uuid],
        );
    }

    private static function kg(float $kg): string
    {
        return $kg >= 1000 ? rtrim(rtrim(number_format($kg / 1000, 1, ',', '.'), '0'), ',').' tấn' : number_format($kg, 0, ',', '.').' kg';
    }

    private function authorizeOwner(Request $request, ProduceOffer $offer): void
    {
        abort_unless($offer->user_id === $request->user()->id, 404);
    }
}
