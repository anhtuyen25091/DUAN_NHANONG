<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\ThresholdResource;
use App\Models\Metric;
use App\Models\Plot;
use App\Services\Irrigation\CropPresets;
use App\Support\Ownership;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Gợi ý ngưỡng / lịch tưới / khóa an toàn theo cây trồng (cà phê vối, hồ tiêu, sầu riêng), có ghi nguồn.
 */
class CropPresetController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['data' => CropPresets::all()]);
    }

    /**
     * Đặt các ngưỡng gợi ý cho lô (ghi đè ngưỡng cùng chỉ số). Lịch tưới và khóa an toàn cần chọn máy bơm / cảm biến nên app tự điền vào form.
     */
    public function apply(Request $request, Plot $plot): JsonResponse
    {
        Ownership::plot($request, $plot);
        $data = $request->validate(['preset' => ['required', Rule::in(array_column(CropPresets::all(), 'code'))]]);
        $preset = CropPresets::find($data['preset']);

        foreach ($preset['thresholds'] as $threshold) {
            $plot->thresholds()->updateOrCreate(
                ['metric_id' => Metric::byCode()[$threshold['metric']]->id],
                ['min' => $threshold['min'], 'max' => $threshold['max'], 'note' => mb_substr($threshold['note'], 0, 191)],
            );
        }

        return response()->json([
            'thresholds' => ThresholdResource::collection($plot->thresholds()->with('metric')->get()),
            'preset' => $preset,
        ]);
    }
}
