<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\ShopType;
use App\Http\Controllers\Controller;
use App\Http\Requests\ShopIndexRequest;
use App\Http\Requests\ShopSubmissionStoreRequest;
use App\Http\Resources\ShopResource;
use App\Models\Shop;
use App\Models\ShopSubmission;
use App\Support\Geo;
use App\Support\Provinces;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;

class ShopController extends Controller
{
    private const PER_PAGE = 30;

    /** Khi tìm quanh vị trí, mặc định trong bán kính này (km) */
    private const DEFAULT_RADIUS = 30;

    /**
     * Danh sách điểm bán; có lat/lng thì lọc theo bán kính và sắp theo khoảng cách.
     */
    public function index(ShopIndexRequest $request): JsonResponse
    {
        $query = Shop::query()
            ->active()
            ->when($request->validated('type'), fn (Builder $query, string $type) => $query->ofType(ShopType::from($type)))
            ->when($request->validated('province'), fn (Builder $query, string $code) => $query->where('province_code', $code))
            ->when($request->validated('q'), function (Builder $query, string $search): void {
                $query->where(fn (Builder $query) => $query
                    ->where('name', 'like', "%{$search}%")
                    ->orWhere('address', 'like', "%{$search}%")
                    ->orWhere('goods', 'like', "%{$search}%"));
            });

        $page = (int) ($request->validated('page') ?? 1);
        $lat = $request->validated('lat');

        if ($lat === null) {
            $paginator = $query->orderByDesc('is_verified')->orderBy('name')->paginate(self::PER_PAGE, page: $page);

            return response()->json([
                'data' => ShopResource::collection($paginator->items()),
                'meta' => ['page' => $page, 'has_more' => $paginator->hasMorePages(), 'total' => $paginator->total()],
            ]);
        }

        // Lọc thô bằng khung vuông trong SQL (chạy được cả MySQL lẫn SQLite), rồi tính khoảng cách thật
        $lat = (float) $lat;
        $lng = (float) $request->validated('lng');
        $radius = (int) ($request->validated('radius') ?? self::DEFAULT_RADIUS);
        $shops = Geo::withinBox($query, $lat, $lng, $radius)
            ->get()
            ->each(fn (Shop $shop) => $shop->distance_km = Geo::distanceKm($lat, $lng, $shop->lat, $shop->lng))
            ->filter(fn (Shop $shop): bool => $shop->distance_km <= $radius)
            ->sortBy('distance_km')
            ->values();

        $items = $shops->forPage($page, self::PER_PAGE)->values();

        return response()->json([
            'data' => ShopResource::collection($items),
            'meta' => ['page' => $page, 'has_more' => $shops->count() > $page * self::PER_PAGE, 'total' => $shops->count(), 'radius_km' => $radius],
        ]);
    }

    /**
     * Các tỉnh/thành (34 đơn vị mới) kèm số điểm bán.
     */
    public function provinces(): JsonResponse
    {
        $counts = Shop::query()->active()->whereNotNull('province_code')
            ->selectRaw('province_code, count(*) as total')
            ->groupBy('province_code')
            ->pluck('total', 'province_code');

        return response()->json(['data' => collect(Provinces::options())
            ->map(fn (string $name, string $code): array => ['code' => $code, 'name' => $name, 'shops' => (int) ($counts[$code] ?? 0)])
            ->values()]);
    }

    /**
     * Người dùng đề xuất điểm mới hoặc báo sửa; admin duyệt mới hiện.
     */
    public function submit(ShopSubmissionStoreRequest $request): JsonResponse
    {
        $data = $request->safe()->except(['shop_id', 'note']);

        ShopSubmission::query()->create([
            'device_id' => DeviceController::device($request)->id,
            'shop_id' => $request->validated('shop_id'),
            'data' => $data,
            'note' => $request->validated('note'),
        ]);

        return response()->json(['message' => 'Cảm ơn bạn! Thông tin sẽ hiện sau khi được kiểm tra.'], 201);
    }
}
