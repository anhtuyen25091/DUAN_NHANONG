<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\PlotType;
use App\Http\Controllers\Controller;
use App\Http\Resources\AlertResource;
use App\Http\Resources\DeviceResource;
use App\Http\Resources\PlotResource;
use App\Models\Alert;
use App\Models\Farm;
use App\Models\Plot;
use App\Models\Reading;
use App\Support\LatestReadings;
use App\Support\Ownership;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

class PlotController extends Controller
{
    public function store(Request $request, Farm $farm): JsonResponse
    {
        $plot = Ownership::farm($request, $farm)->plots()->create($this->validated($request));

        return (new PlotResource($plot))->response()->setStatusCode(201);
    }

    public function update(Request $request, Plot $plot): PlotResource
    {
        Ownership::plot($request, $plot)->update($this->validated($request));

        return new PlotResource($plot);
    }

    public function destroy(Request $request, Plot $plot): Response
    {
        Ownership::plot($request, $plot)->delete();

        return response()->noContent();
    }

    /**
     * Màn hình chính của 1 lô: số đo mới nhất của mọi chỉ số (từ mọi thiết bị trong lô), so với ngưỡng.
     */
    public function summary(Request $request, Plot $plot): JsonResponse
    {
        Ownership::plot($request, $plot, Ownership::VIEW);

        $devices = $plot->devices()->orderBy('name')->get();
        $thresholds = $plot->thresholds()->get()->keyBy('metric_id');

        $readings = LatestReadings::forDevices($devices->modelKeys())->map(function (Reading $reading) use ($devices, $thresholds) {
            $threshold = $thresholds[$reading->metric_id] ?? null;

            return LatestReadings::present($reading) + [
                'device_id' => $reading->device_id,
                'device_name' => $devices->find($reading->device_id)->name,
                'status' => $threshold === null ? null : ($threshold->check($reading->value)?->value ?? 'ok'),
                'min' => $threshold?->min,
                'max' => $threshold?->max,
            ];
        });

        $alerts = Alert::query()->open()
            ->whereIn('threshold_id', $thresholds->pluck('id'))
            ->with(['threshold.plot', 'threshold.metric', 'device'])
            ->latest('measured_at')
            ->get();

        return response()->json(['data' => [
            'plot' => new PlotResource($plot),
            'devices' => DeviceResource::collection($devices),
            'readings' => $readings,
            'open_alerts' => AlertResource::collection($alerts),
            'role' => $plot->farm->roleOf($request->user()),
        ]]);
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'type' => ['required', Rule::enum(PlotType::class)],
            'crop' => ['nullable', 'string', 'max:100'],
            'area_m2' => ['nullable', 'integer', 'min:1'],
        ]);
    }
}
