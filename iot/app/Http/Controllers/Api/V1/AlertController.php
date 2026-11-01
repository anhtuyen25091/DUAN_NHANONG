<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\AlertResource;
use App\Models\Alert;
use App\Support\Ownership;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class AlertController extends Controller
{
    /**
     * Cảnh báo của mọi lô thuộc trang trại của mình hoặc được chia sẻ; ?open=1 chỉ lấy cảnh báo đang mở.
     */
    public function index(Request $request): AnonymousResourceCollection
    {
        $alerts = Alert::query()
            ->whereHas('threshold.plot.farm', fn ($query) => $query->accessibleBy($request->user()))
            ->when($request->boolean('open'), fn ($query) => $query->open())
            ->with(['threshold.plot', 'threshold.metric', 'device'])
            ->latest('measured_at')
            ->paginate(50);

        return AlertResource::collection($alerts);
    }

    /**
     * Người dùng xác nhận đã xử lý (VD đã thay nước ao) trước khi số đo tự về lại ngưỡng.
     */
    public function resolve(Request $request, Alert $alert): AlertResource
    {
        Ownership::plot($request, $alert->threshold->plot, Ownership::CONTROL);

        if ($alert->resolved_at === null) {
            $alert->update(['resolved_at' => now()]);
        }

        return new AlertResource($alert->load(['threshold.plot', 'threshold.metric', 'device']));
    }
}
