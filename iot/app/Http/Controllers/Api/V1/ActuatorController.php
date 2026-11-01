<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\ActuatorKind;
use App\Http\Controllers\Controller;
use App\Http\Resources\ActuatorResource;
use App\Http\Resources\CommandResource;
use App\Models\Actuator;
use App\Models\ActuatorCommand;
use App\Models\Device;
use App\Models\Metric;
use App\Models\Plot;
use App\Services\Control\BlockedCommandException;
use App\Services\Control\CommandService;
use App\Support\Ownership;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

/**
 * Máy bơm / quạt oxy / van... của người dùng: khai báo (gắn vào kênh relay của mạch điều khiển), bật / tắt bằng tay.
 */
class ActuatorController extends Controller
{
    public function __construct(private readonly CommandService $commands) {}

    public function index(Request $request, Plot $plot): AnonymousResourceCollection
    {
        Ownership::plot($request, $plot);

        return ActuatorResource::collection($plot->actuators()->with(['device', 'openCommand', 'blockDevice', 'blockMetric'])->orderBy('name')->get());
    }

    public function store(Request $request, Device $device): JsonResponse
    {
        Ownership::device($request, $device);
        $actuator = $device->actuators()->create($this->validated($request, $device));

        return (new ActuatorResource($actuator->load(['device', 'openCommand', 'blockDevice', 'blockMetric'])))->response()->setStatusCode(201);
    }

    public function update(Request $request, Actuator $actuator): ActuatorResource
    {
        Ownership::device($request, $actuator->device);
        $actuator->update($this->validated($request, $actuator->device, $actuator));

        return new ActuatorResource($actuator->load(['device', 'openCommand', 'blockDevice', 'blockMetric']));
    }

    public function destroy(Request $request, Actuator $actuator): Response
    {
        Ownership::device($request, $actuator->device);
        $actuator->delete();

        return response()->noContent();
    }

    /**
     * Bật (kèm số phút, tối đa max_minutes) / tắt. Mạch lấy lệnh trong vài giây; quá 10 phút chưa lấy thì lệnh hủy.
     */
    public function command(Request $request, Actuator $actuator): JsonResponse
    {
        Ownership::device($request, $actuator->device);
        $data = $request->validate([
            'action' => ['required', Rule::in([ActuatorCommand::ON, ActuatorCommand::OFF])],
            'minutes' => ['nullable', 'integer', 'min:1', 'max:'.$actuator->max_minutes],
        ], ['minutes.max' => "Thiết bị này chạy tối đa {$actuator->max_minutes} phút mỗi lần."]);

        try {
            $command = $this->commands->issue($actuator, $data['action'], $data['minutes'] ?? null, ActuatorCommand::SOURCE_MANUAL, $request->user());
        } catch (BlockedCommandException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return (new CommandResource($command))->response()->setStatusCode(201);
    }

    public function history(Request $request, Actuator $actuator): AnonymousResourceCollection
    {
        Ownership::device($request, $actuator->device);

        return CommandResource::collection($actuator->commands()->latest('id')->limit(30)->get());
    }

    /**
     * @return array<string, mixed>
     */
    private function validated(Request $request, Device $device, ?Actuator $actuator = null): array
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'kind' => ['required', Rule::enum(ActuatorKind::class)],
            'channel' => ['required', 'integer', 'min:1', 'max:16', Rule::unique('actuators')->where('device_id', $device->id)->ignore($actuator)],
            'plot_id' => ['nullable', 'integer'],
            'max_minutes' => ['nullable', 'integer', 'min:1', 'max:720'],
            // Khóa an toàn: cảm biến nguồn nước cùng trang trại, VD độ mặn > 0,3‰ thì không bơm
            'block_device_id' => ['nullable', 'integer', Rule::in($device->farm->devices()->pluck('id'))],
            'block_metric' => ['nullable', 'required_with:block_device_id', 'string', Rule::exists('metrics', 'code')],
            'block_operator' => ['nullable', 'required_with:block_device_id', Rule::in(['above', 'below'])],
            'block_value' => ['nullable', 'required_with:block_device_id', 'numeric'],
        ], [
            'channel.unique' => 'Kênh relay này đã gắn thiết bị khác.',
            'block_device_id.in' => 'Chọn cảm biến của cùng trang trại.',
        ]);

        $data['block_metric_id'] = isset($data['block_device_id']) ? Metric::byCode()[$data['block_metric']]->id : null;
        if (! isset($data['block_device_id'])) {
            $data['block_device_id'] = null;
            $data['block_operator'] = null;
            $data['block_value'] = null;
        }
        unset($data['block_metric']);

        if (($data['plot_id'] ?? null) !== null) {
            abort_unless(Plot::query()->whereKey($data['plot_id'])->value('farm_id') === $device->farm_id, 422, 'Lô không thuộc trang trại của mạch điều khiển.');
        }
        $data['plot_id'] ??= $device->plot_id;
        $data['max_minutes'] ??= 60;

        return $data;
    }
}
