<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\RuleResource;
use App\Models\Actuator;
use App\Models\AutomationRule;
use App\Models\Metric;
use App\Models\Plot;
use App\Support\Ownership;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

/**
 * Luật tự động của lô: "DO < 4 thì bật quạt oxy 60 phút, DO ≥ 5 thì tắt".
 */
class RuleController extends Controller
{
    public function index(Request $request, Plot $plot): AnonymousResourceCollection
    {
        Ownership::plot($request, $plot, Ownership::VIEW);

        return RuleResource::collection($plot->rules()->with(['metric', 'actuator'])->get());
    }

    public function store(Request $request, Plot $plot): JsonResponse
    {
        Ownership::plot($request, $plot);
        $rule = $plot->rules()->create($this->validated($request, $plot));

        return (new RuleResource($rule->load(['metric', 'actuator'])))->response()->setStatusCode(201);
    }

    public function update(Request $request, AutomationRule $rule): RuleResource
    {
        Ownership::plot($request, $rule->plot);
        $rule->update($this->validated($request, $rule->plot));

        return new RuleResource($rule->load(['metric', 'actuator']));
    }

    public function destroy(Request $request, AutomationRule $rule): Response
    {
        Ownership::plot($request, $rule->plot);
        $rule->delete();

        return response()->noContent();
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, Plot $plot): array
    {
        $actuatorIds = Actuator::query()->whereIn('device_id', $plot->farm->devices()->select('id'))->pluck('id');

        $data = $request->validate([
            'metric' => ['required', 'string', Rule::exists('metrics', 'code')],
            'actuator_id' => ['required', Rule::in($actuatorIds)],
            'operator' => ['required', Rule::in([AutomationRule::BELOW, AutomationRule::ABOVE])],
            'value' => ['required', 'numeric'],
            'off_value' => ['nullable', 'numeric'],
            'minutes' => ['required', 'integer', 'min:1', 'max:720'],
            'cooldown_minutes' => ['nullable', 'integer', 'min:5', 'max:1440'],
            'enabled' => ['sometimes', 'boolean'],
        ], [
            'actuator_id.in' => 'Chọn thiết bị điều khiển của trang trại này.',
        ]);

        // Mức tắt phải "an toàn hơn" mức bật, nếu không máy sẽ bật / tắt liên tục
        if (isset($data['off_value'])) {
            $wrongSide = $data['operator'] === AutomationRule::BELOW ? $data['off_value'] < $data['value'] : $data['off_value'] > $data['value'];
            abort_if($wrongSide, 422, $data['operator'] === AutomationRule::BELOW ? 'Mức tắt phải lớn hơn hoặc bằng mức bật.' : 'Mức tắt phải nhỏ hơn hoặc bằng mức bật.');
        }

        $data['metric_id'] = Metric::byCode()[$data['metric']]->id;
        unset($data['metric']);
        $data['minutes'] = min($data['minutes'], Actuator::query()->whereKey($data['actuator_id'])->value('max_minutes'));
        $data['cooldown_minutes'] ??= 30;

        return $data;
    }
}
