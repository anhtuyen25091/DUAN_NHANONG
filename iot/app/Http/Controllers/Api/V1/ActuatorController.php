<?php

namespace App\Http\Controllers\Api\V1;

use App\Enums\ActuatorKind;
use App\Http\Controllers\Controller;
use App\Http\Resources\ActuatorResource;
use App\Http\Resources\CommandResource;
use App\Models\Actuator;
use App\Models\ActuatorCommand;
use App\Models\Device;
use App\Models\Plot;
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

        return ActuatorResource::collection($plot->actuators()->with(['device', 'openCommand'])->orderBy('name')->get());
    }

    public function store(Request $request, Device $device): JsonResponse
    {
        Ownership::device($request, $device);
        $actuator = $device->actuators()->create($this->validated($request, $device));

        return (new ActuatorResource($actuator->load(['device', 'openCommand'])))->response()->setStatusCode(201);
    }

    public function update(Request $request, Actuator $actuator): ActuatorResource
    {
        Ownership::device($request, $actuator->device);
        $actuator->update($this->validated($request, $actuator->device, $actuator));

        return new ActuatorResource($actuator->load(['device', 'openCommand']));
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

        $command = $this->commands->issue($actuator, $data['action'], $data['minutes'] ?? null, ActuatorCommand::SOURCE_MANUAL, $request->user());

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
        ], ['channel.unique' => 'Kênh relay này đã gắn thiết bị khác.']);

        if (($data['plot_id'] ?? null) !== null) {
            abort_unless(Plot::query()->whereKey($data['plot_id'])->value('farm_id') === $device->farm_id, 422, 'Lô không thuộc trang trại của mạch điều khiển.');
        }
        $data['plot_id'] ??= $device->plot_id;
        $data['max_minutes'] ??= 60;

        return $data;
    }
}
