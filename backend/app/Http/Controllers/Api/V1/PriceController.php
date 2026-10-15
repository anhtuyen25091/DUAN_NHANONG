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
     * Chuỗi giá theo ngày của 1 mặt hàng để vẽ biểu đồ.
     */
    public function history(PriceHistoryRequest $request, Product $product): JsonResponse
    {
        $to = CarbonImmutable::parse($request->validated('to') ?? 'today');
        $days = (int) ($request->validated('days') ?? 30);
        $region = $request->validated('region')
            ? Region::query()->where('code', $request->validated('region'))->firstOrFail()
            : null;

        return response()->json([
            'product' => new ProductResource($product->load('category')),
            'region' => $region ? new RegionResource($region) : null,
            'from' => $to->subDays($days - 1)->toDateString(),
            'to' => $to->toDateString(),
            'points' => $this->board->history($product->id, $region?->id, $to->subDays($days - 1), $to),
        ]);
    }
}
