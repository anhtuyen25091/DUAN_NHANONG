<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\ThresholdResource;
use App\Models\Metric;
use App\Models\Plot;
use App\Models\Threshold;
use App\Support\Ownership;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

class ThresholdController extends Controller
{
    public function index(Request $request, Plot $plot): AnonymousResourceCollection
    {
        return ThresholdResource::collection(Ownership::plot($request, $plot, Ownership::VIEW)->thresholds()->with('metric')->get());
    }

    /**
     * Đặt ngưỡng cho 1 chỉ số của lô (đặt lại thì ghi đè).
     */
    public function store(Request $request, Plot $plot): JsonResponse
    {
        Ownership::plot($request, $plot);

        $data = $request->validate([
            'metric' => ['required', 'string', Rule::exists('metrics', 'code')],
            'min' => ['nullable', 'numeric', 'required_without:max'],
            'max' => ['nullable', 'numeric', 'required_without:min', Rule::when($request->filled('min'), 'gte:min')],
            'note' => ['nullable', 'string', 'max:191'],
        ], [
            'min.required_without' => 'Cần ít nhất mức thấp nhất hoặc cao nhất.',
            'max.gte' => 'Mức cao nhất phải lớn hơn mức thấp nhất.',
        ]);

        $threshold = $plot->thresholds()->updateOrCreate(
            ['metric_id' => Metric::byCode()[$data['metric']]->id],
            ['min' => $data['min'] ?? null, 'max' => $data['max'] ?? null, 'note' => $data['note'] ?? null],
        );

        return (new ThresholdResource($threshold->load('metric')))
            ->response()
            ->setStatusCode($threshold->wasRecentlyCreated ? 201 : 200);
    }

    public function destroy(Request $request, Threshold $threshold): Response
    {
        Ownership::plot($request, $threshold->plot);
        $threshold->delete();

        return response()->noContent();
    }
}
