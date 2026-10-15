<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\PriceHistoryRequest;
use App\Http\Requests\PriceIndexRequest;
use App\Http\Resources\ProductResource;
use App\Http\Resources\RegionResource;
use App\Models\Product;
use App\Models\Region;
use App\Queries\PriceBoard;
use App\Support\PriceAccess;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;

class PriceController extends Controller
{
    public function __construct(private PriceBoard $board) {}

    /**
     * Giá mới nhất của từng mặt hàng × khu vực (lọc theo loại, danh mục, khu vực, mặt hàng).
     */
    public function index(PriceIndexRequest $request): JsonResponse
    {
        $date = CarbonImmutable::parse($request->validated('date') ?? 'today');

        $rows = $this->board->latest($date, $request->safe()->only(['type', 'category', 'region', 'product']))
            ->map(fn (array $row): array => [
                ...$row,
                'product' => new ProductResource($row['product']),
                'region' => new RegionResource($row['region']),
            ]);

        return response()->json(['data' => $rows, 'date' => $date->toDateString()]);
    }

    /**
     * Chuỗi giá của 1 mặt hàng để vẽ biểu đồ.
     * Khách xem 10 ngày gần nhất, tài khoản đăng ký 30 ngày, tài khoản có gói xem toàn bộ (config/nhanong.php).
     * Giới hạn tính từ hôm nay nên đổi tham số `to` về quá khứ cũng không xem được dữ liệu cũ.
     * Khoảng dài thì gộp điểm theo tuần (> 120 ngày) hoặc tháng (> 2 năm) cho biểu đồ nhẹ.
     */
    public function history(PriceHistoryRequest $request, Product $product): JsonResponse
    {
        $today = CarbonImmutable::today();
        $to = CarbonImmutable::parse($request->validated('to') ?? 'today')->min($today);
        $days = (int) ($request->validated('days') ?? 30);
        $from = $to->subDays($days - 1);
        $region = $request->validated('region')
            ? Region::query()->where('code', $request->validated('region'))->firstOrFail()
            : null;

        $tier = PriceAccess::tier($request->user('sanctum'));
        $earliest = PriceAccess::earliestDate($tier);
        $limited = $earliest !== null && $from->lessThan($earliest);
        if ($limited) {
            $from = $earliest;
        }

        $span = $from->diffInDays($to) + 1;
        $interval = $span > 730 ? 'month' : ($span > 120 ? 'week' : 'day');

        return response()->json([
            'product' => new ProductResource($product->load('category')),
            'region' => $region ? new RegionResource($region) : null,
            'from' => $from->toDateString(),
            'to' => $to->toDateString(),
            'interval' => $interval,
            'points' => $from->greaterThan($to) ? [] : $this->board->history($product->id, $region?->id, $from, $to, $interval),
            'access' => [
                'tier' => $tier,
                'max_days' => PriceAccess::maxDays($tier),
                'limited' => $limited,
                'first_date' => $this->board->firstDate($product->id, $region?->id),
            ],
        ]);
    }
}
