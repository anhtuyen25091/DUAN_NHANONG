<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\ScheduleResource;
use App\Models\Actuator;
use App\Models\ActuatorSchedule;
use App\Models\Plot;
use App\Support\Ownership;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

/**
 * Lịch tưới của các thiết bị điều khiển trong lô.
 */
class ScheduleController extends Controller
{
    public function index(Request $request, Plot $plot): AnonymousResourceCollection
    {
        Ownership::plot($request, $plot);

        return ScheduleResource::collection(
            ActuatorSchedule::query()->with('actuator')->whereIn('actuator_id', $plot->actuators()->select('id'))->orderBy('start_time')->get()
        );
    }

    public function store(Request $request, Actuator $actuator): JsonResponse
    {
        Ownership::device($request, $actuator->device);
        $data = $this->validated($request, $actuator);
        $schedule = $actuator->schedules()->create($data + ['next_run_on' => self::firstRun($data['start_time'])]);

        return (new ScheduleResource($schedule->load('actuator')))->response()->setStatusCode(201);
    }

    public function update(Request $request, ActuatorSchedule $schedule): ScheduleResource
    {
        Ownership::device($request, $schedule->actuator->device);
        $data = $this->validated($request, $schedule->actuator);
        // Đổi giờ / chu kỳ thì tính lại lượt kế tiếp từ hôm nay
        if ($data['start_time'] !== $schedule->startsAt() || $data['every_days'] !== $schedule->every_days) {
            $data['next_run_on'] = self::firstRun($data['start_time']);
        }
        $schedule->update($data);

        return new ScheduleResource($schedule->load('actuator'));
    }

    public function destroy(Request $request, ActuatorSchedule $schedule): Response
    {
        Ownership::device($request, $schedule->actuator->device);
        $schedule->delete();

        return response()->noContent();
    }

    /** Hôm nay nếu chưa tới giờ, không thì ngày mai */
    private static function firstRun(string $startTime): string
    {
        $now = CarbonImmutable::now();

        return ($startTime > $now->format('H:i') ? $now : $now->addDay())->toDateString();
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, Actuator $actuator): array
    {
        $data = $request->validate([
            'start_time' => ['required', 'date_format:H:i'],
            'minutes' => ['required', 'integer', 'min:1', 'max:'.$actuator->max_minutes],
            'every_days' => ['required', 'integer', 'min:1', 'max:60'],
            'months' => ['nullable', 'array', 'max:12'],
            'months.*' => ['integer', 'between:1,12', 'distinct'],
            'skip_rain_mm' => ['nullable', 'numeric', 'min:0', 'max:200'],
            'note' => ['nullable', 'string', 'max:191'],
            'enabled' => ['sometimes', 'boolean'],
        ], [
            'minutes.max' => "{$actuator->name} chạy tối đa {$actuator->max_minutes} phút mỗi lần (sửa trong thiết bị điều khiển).",
            'start_time.date_format' => 'Giờ tưới dạng HH:MM, VD 05:30.',
        ]);

        $data['months'] = empty($data['months']) ? null : array_values(array_map('intval', $data['months']));
        $data['every_days'] = (int) $data['every_days'];

        return $data;
    }
}
