<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\PriceAlertStoreRequest;
use App\Http\Resources\PriceAlertResource;
use App\Models\PriceAlert;
use App\Models\Product;
use App\Models\Region;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

class PriceAlertController extends Controller
{
    /** Giới hạn để tránh lạm dụng */
    public const MAX_PER_DEVICE = 50;

    public function index(Request $request): AnonymousResourceCollection
    {
        $alerts = DeviceController::device($request)->priceAlerts()
            ->with(['product', 'region'])
            ->latest('id')
            ->get();

        return PriceAlertResource::collection($alerts);
    }

    public function store(PriceAlertStoreRequest $request): JsonResponse
    {
        $device = DeviceController::device($request);
        if ($device->priceAlerts()->count() >= self::MAX_PER_DEVICE) {
            return response()->json(['message' => 'Mỗi máy được đặt tối đa '.self::MAX_PER_DEVICE.' cảnh báo.'], 422);
        }

        $attributes = [
            'product_id' => Product::query()->where('code', $request->validated('product'))->value('id'),
            'region_id' => $request->validated('region')
                ? Region::query()->where('code', $request->validated('region'))->value('id')
                : null,
            'condition' => $request->validated('condition'),
            'threshold' => $request->validated('threshold'),
        ];

        // Đặt lại cảnh báo y hệt thì trả về cái cũ
        $alert = $device->priceAlerts()->where($attributes)->first()
            ?? $device->priceAlerts()->create($attributes);

        return (new PriceAlertResource($alert->load(['product', 'region'])))
            ->response()
            ->setStatusCode($alert->wasRecentlyCreated ? 201 : 200);
    }

    public function destroy(Request $request, PriceAlert $alert): Response
    {
        abort_unless($alert->device_id === DeviceController::device($request)->id, 404);

        $alert->delete();

        return response()->noContent();
    }
}
