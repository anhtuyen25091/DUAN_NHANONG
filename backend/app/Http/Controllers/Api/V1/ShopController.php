<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\ShopType;
use App\Http\Controllers\Controller;
use App\Http\Requests\ShopIndexRequest;
use App\Http\Requests\ShopMapRequest;
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

    /** Xem trên bản đồ: lấy tối đa chừng này điểm 1 lần (bản đồ vẽ bằng canvas, vài nghìn chấm vẫn mượt) */
    private const MAP_LIMIT = 3000;

    /** Bản đồ: khung đang xem có không quá chừng này điểm thì trả từng điểm, nhiều hơn thì gom cụm */
    private const MAP_POINTS = 600;

    /** Mỗi cụm ứng với 1 ô lưới rộng khoảng chừng này điểm ảnh trên màn hình */
    private const CLUSTER_CELL_PX = 80;

    /** Khi tìm quanh vị trí, mặc định trong bán kính này (km) */
    private const DEFAULT_RADIUS = 30;

    /**
     * Bản đồ điểm bán theo khung đang xem: ít điểm thì trả từng điểm (shops), nhiều thì gom theo ô lưới (clusters: tâm, số điểm),
     * nên bản đồ cả nước vài chục nghìn điểm vẫn nhẹ. Phóng to hết cỡ (≥ 15) mà vẫn đông thì trả 600 điểm đầu.
     */
    public function map(ShopMapRequest $request): JsonResponse
    {
        [$south, $west, $north, $east] = $request->bbox();
        $zoom = (int) $request->validated('zoom');
        $query = Shop::query()
            ->active()
            ->whereNotNull('lat')
            ->whereNotNull('lng')
            ->whereBetween('lat', [$south, $north])
            ->whereBetween('lng', [$west, $east])
            ->when($request->validated('type'), fn (Builder $query, string $type) => $query->ofType(ShopType::from($type)))
            ->when($request->validated('province'), fn (Builder $query, string $code) => $query->where('province_code', $code))
            ->when($request->validated('q'), function (Builder $query, string $search): void {
                $query->where(fn (Builder $query) => $query
                    ->where('name', 'like', "%{$search}%")
                    ->orWhere('address', 'like', "%{$search}%")
                    ->orWhere('goods', 'like', "%{$search}%"));
            });

        $total = (clone $query)->count();
        if ($total <= self::MAP_POINTS || $zoom >= 15) {
            return response()->json([
                'shops' => ShopResource::collection((clone $query)->orderByDesc('is_verified')->limit(self::MAP_POINTS)->get()),
                'clusters' => [],
                'total' => $total,
            ]);
        }

        // Ô lưới theo độ: 1 ô ≈ CLUSTER_CELL_PX điểm ảnh ở mức phóng hiện tại (256 px / ô bản đồ)
        $cell = 360 / (256 * 2 ** $zoom) * self::CLUSTER_CELL_PX;
        // Làm tròn xuống số nguyên: MySQL dùng FLOOR, SQLite (test) không có FLOOR nên CAST (tọa độ Việt Nam đều dương).
        // Kích thước ô do máy chủ tính (không lấy từ người dùng) nên ghi thẳng số: MySQL (ONLY_FULL_GROUP_BY) coi 2 biểu thức có ? là khác nhau
        $size = sprintf('%.10F', $cell);
        $cellOf = fn (string $column): string => $query->getConnection()->getDriverName() === 'sqlite'
            ? "CAST({$column} / {$size} AS INTEGER)"
            : "FLOOR({$column} / {$size})";
        $clusters = (clone $query)
            ->selectRaw("{$cellOf('lat')} as gy, {$cellOf('lng')} as gx, COUNT(*) as n, AVG(lat) as lat, AVG(lng) as lng")
            ->groupByRaw("{$cellOf('lat')}, {$cellOf('lng')}")
            ->toBase()
            ->get()
            ->map(fn (object $row): array => ['lat' => round((float) $row->lat, 5), 'lng' => round((float) $row->lng, 5), 'count' => (int) $row->n])
            ->values();

        return response()->json(['shops' => [], 'clusters' => $clusters, 'total' => $total]);
    }

    /**
     * Danh sách điểm bán; có lat/lng thì lọc theo bán kính và sắp theo khoảng cách.
     * map=1: chỉ điểm có tọa độ, tối đa 3.000 điểm / trang (để chấm lên bản đồ).
     */
    public function index(ShopIndexRequest $request): JsonResponse
    {
        $forMap = $request->boolean('map');
        $perPage = $forMap ? self::MAP_LIMIT : self::PER_PAGE;
        $query = Shop::query()
            ->active()
            ->when($forMap, fn (Builder $query) => $query->whereNotNull('lat')->whereNotNull('lng'))
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
            $paginator = $query->orderByDesc('is_verified')->orderBy('name')->paginate($perPage, page: $page);

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

        $items = $shops->forPage($page, $perPage)->values();

        return response()->json([
            'data' => ShopResource::collection($items),
            'meta' => ['page' => $page, 'has_more' => $shops->count() > $page * $perPage, 'total' => $shops->count(), 'radius_km' => $radius],
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
