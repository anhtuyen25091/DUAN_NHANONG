<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\CategoryType;
use App\Enums\ReportStatus;
use App\Http\Controllers\Controller;
use App\Models\PriceReport;
use App\Models\PriceReportFlag;
use App\Support\Geo;
use App\Support\PlaceSearch;
use App\Support\Provinces;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\Rule;

/**
 * Giá quanh 1 vị trí do các điểm mua đã duyệt đăng, gom theo mặt hàng, kèm giá chung (crawl) của tỉnh để so.
 * Nông sản: điểm trả giá cao xếp trước; phân / thuốc: điểm bán rẻ xếp trước.
 */
class LocalPriceController extends Controller
{
    public const DEFAULT_RADIUS = 30;

    public const DEFAULT_DAYS = 7;

    /** Mặt hàng không có giá trong bán kính: tìm tiếp tới chừng này km để gợi ý "xa hơn còn có …" */
    public const FARTHER_KM = 100;

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'lat' => ['required', 'numeric', 'between:-90,90'],
            'lng' => ['required', 'numeric', 'between:-180,180'],
            'province' => ['nullable', Rule::in(array_keys(Provinces::options()))],
            'radius' => ['nullable', 'integer', 'min:1', 'max:200'],
            'days' => ['nullable', 'integer', 'min:1', 'max:30'],
            'type' => ['nullable', Rule::enum(CategoryType::class)],
            'product' => ['nullable', 'string', 'exists:products,code'],
        ]);

        $lat = (float) $data['lat'];
        $lng = (float) $data['lng'];
        $radius = (int) ($data['radius'] ?? self::DEFAULT_RADIUS);
        $days = (int) ($data['days'] ?? self::DEFAULT_DAYS);
        $today = CarbonImmutable::today();

        // Lấy rộng tới FARTHER_KM một lần, rồi tách trong / ngoài bán kính
        $searchKm = max($radius, self::FARTHER_KM);
        [$reports, $outside] = Geo::withinBox(PriceReport::query()->published(), $lat, $lng, $searchKm)
            ->with(['buyer', 'product.category'])
            ->where('date', '>=', $today->subDays($days - 1)->toDateString())
            ->whereHas('buyer', fn (Builder $q) => $q->where('status', 'approved'))
            ->when($data['type'] ?? null, fn (Builder $q, string $type) => $q->whereHas('product.category', fn (Builder $c) => $c->where('type', $type)))
            ->when($data['product'] ?? null, fn (Builder $q, string $code) => $q->whereHas('product', fn (Builder $p) => $p->where('code', $code)))
            ->get()
            ->each(fn (PriceReport $r) => $r->distance_km = Geo::distanceKm($lat, $lng, $r->lat, $r->lng))
            ->filter(fn (PriceReport $r): bool => $r->distance_km <= $searchKm)
            // Mỗi điểm mua 1 giá mới nhất cho mỗi mặt hàng
            ->sortByDesc(fn (PriceReport $r): string => $r->date->toDateString().'|'.$r->updated_at)
            ->unique(fn (PriceReport $r): string => $r->buyer_id.'|'.$r->product_id)
            ->partition(fn (PriceReport $r): bool => $r->distance_km <= $radius);

        $province = $data['province'] ?? $this->nearestProvince($lat, $lng);

        $products = $reports->groupBy('product_id')
            ->map(fn (Collection $group): array => $this->summary($group, $province, $today))
            ->sortByDesc('count')
            ->values();

        return response()->json([
            'data' => $products,
            'meta' => [
                'radius_km' => $radius,
                'days' => $days,
                'province' => $province,
                'province_name' => Provinces::name($province),
                'farther' => $this->farther($outside, $reports),
            ],
        ]);
    }

    /**
     * Tìm địa danh (xã / phường / thôn / huyện cũ) để lấy đúng tọa độ chỗ ở, thay vì trung tâm tỉnh.
     */
    public function places(Request $request, PlaceSearch $search): JsonResponse
    {
        $data = $request->validate([
            'q' => ['required', 'string', 'min:2', 'max:100'],
            'province' => ['nullable', Rule::in(array_keys(Provinces::options()))],
        ]);

        $places = $search->search($data['q'], $data['province'] ?? null);
        if ($places === null) {
            return response()->json(['message' => 'Chưa tìm được địa danh lúc này. Hãy thử lại sau, hoặc dùng vị trí của máy.'], 503);
        }

        return response()->json(['data' => $places]);
    }

    /**
     * Mặt hàng chỉ có giá ngoài bán kính (tới FARTHER_KM): điểm mua gần nhất cách bao xa, có mấy điểm.
     *
     * @param  Collection<int, PriceReport>  $outside
     * @param  Collection<int, PriceReport>  $inside
     * @return list<array{product: array{code: string, name: string}, nearest_km: float, count: int}>
     */
    private function farther(Collection $outside, Collection $inside): array
    {
        $shown = $inside->pluck('product_id')->unique();

        return $outside->reject(fn (PriceReport $r): bool => $shown->contains($r->product_id))
            ->groupBy('product_id')
            ->map(fn (Collection $group): array => [
                'product' => ['code' => $group->first()->product->code, 'name' => $group->first()->product->name],
                'nearest_km' => round($group->min('distance_km'), 1),
                'count' => $group->count(),
            ])
            ->sortBy('nearest_km')
            ->values()
            ->all();
    }

    /** Người dùng báo 1 giá sai (mỗi máy 1 lần); đủ lượt thì giá chuyển sang chờ duyệt */
    public function flag(Request $request, PriceReport $report): JsonResponse
    {
        $data = $request->validate(['reason' => ['nullable', 'string', 'max:200']]);
        $device = DeviceController::device($request);

        $flag = PriceReportFlag::query()->firstOrCreate(['price_report_id' => $report->id, 'device_id' => $device->id], ['reason' => $data['reason'] ?? null]);
        if ($flag->wasRecentlyCreated) {
            $report->increment('flags_count');
            if ($report->flags_count >= PriceReport::FLAGS_TO_REVIEW && $report->status === ReportStatus::Published) {
                $report->update(['status' => ReportStatus::NeedsReview, 'review_reason' => $report->flags_count.' người báo giá sai']);
            }
        }

        return response()->json(['message' => 'Cảm ơn bạn đã báo. Giá này sẽ được kiểm tra lại.']);
    }

    /** Lưu khu vực của tôi vào tài khoản (máy khác đăng nhập cũng dùng được). Không gửi tọa độ thì lấy trung tâm tỉnh. */
    public function saveLocation(Request $request): JsonResponse
    {
        $data = $request->validate([
            'province' => ['required', Rule::in(array_keys(Provinces::options()))],
            'lat' => ['nullable', 'required_with:lng', 'numeric', 'between:8,24'],
            'lng' => ['nullable', 'required_with:lat', 'numeric', 'between:102,110'],
            'label' => ['nullable', 'string', 'max:120'],
            'radius' => ['nullable', 'integer', 'in:10,20,30,50'],
        ]);

        [$lat, $lng] = isset($data['lat']) ? [(float) $data['lat'], (float) $data['lng']] : Geo::provinceCenter($data['province']);
        $request->user()->forceFill([
            'home_province' => $data['province'],
            'home_lat' => $lat,
            'home_lng' => $lng,
            'home_label' => $data['label'] ?? null,
            'home_radius' => $data['radius'] ?? self::DEFAULT_RADIUS,
        ])->save();

        return response()->json(['data' => $request->user()->homeLocation()]);
    }

    /**
     * @param  Collection<int, PriceReport>  $group
     * @return array<string, mixed>
     */
    private function summary(Collection $group, ?string $province, CarbonImmutable $today): array
    {
        $product = $group->first()->product;
        $isProduce = $product->category->type === CategoryType::NongSan;
        $prices = $group->pluck('price')->sort()->values();
        $crawled = PriceReport::crawledPrice($product->id, $province, $today);
        $entries = $group->sortBy(fn (PriceReport $r): array => [$isProduce ? -$r->price : $r->price, $r->distance_km])->values();

        return [
            'product' => ['code' => $product->code, 'name' => $product->name, 'unit' => $product->unit, 'type' => $product->category->type->value],
            'count' => $group->count(),
            'min' => $prices->first(),
            'max' => $prices->last(),
            'median' => (int) round($prices->median()),
            'latest_date' => $group->max(fn (PriceReport $r): string => $r->date->toDateString()),
            // Giá chung (crawl) của tỉnh để so: nông sản cao hơn giá chung = có lợi cho người bán
            'reference' => $crawled,
            'entries' => $entries->map(fn (PriceReport $r): array => [
                'id' => $r->id,
                'price' => $r->price,
                'date' => $r->date->toDateString(),
                'note' => $r->note,
                'distance_km' => round($r->distance_km, 1),
                'buyer' => [
                    'id' => $r->buyer->id,
                    'name' => $r->buyer->name,
                    'kind' => $r->buyer->kind->value,
                    'kind_label' => $r->buyer->kind->getLabel(),
                    'is_verified' => $r->buyer->is_verified,
                    'phone' => $r->buyer->phone,
                    'address' => $r->buyer->address,
                    'shop_id' => $r->buyer->shop_id,
                ],
            ]),
        ];
    }

    /** Tỉnh có trung tâm gần vị trí nhất (khi máy không gửi tỉnh) */
    private function nearestProvince(float $lat, float $lng): ?string
    {
        return collect(array_keys(Provinces::options()))
            ->sortBy(function (string $code) use ($lat, $lng): float {
                [$cLat, $cLng] = Geo::provinceCenter($code) ?? [0.0, 0.0];

                return Geo::distanceKm($lat, $lng, $cLat, $cLng);
            })
            ->first();
    }
}
