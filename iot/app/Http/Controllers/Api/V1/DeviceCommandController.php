<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Middleware\AuthenticateDevice;
use App\Models\ActuatorCommand;
use App\Models\Device;
use App\Services\Control\CommandService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Mạch điều khiển (relay) lấy lệnh bật / tắt và báo kết quả. Xác thực bằng khóa thiết bị như /ingest.
 */
class DeviceCommandController extends Controller
{
    public function __construct(private readonly CommandService $commands) {}

    /**
     * GET /device/commands?states=1:1,2:0 — kèm trạng thái relay hiện tại (kênh:1 bật / 0 tắt).
     * Trả {"commands": [{"id": 12, "channel": 1, "action": "on", "minutes": 30}], "poll_seconds": 10, "server_time": ...}
     */
    public function index(Request $request): JsonResponse
    {
        $device = AuthenticateDevice::device($request);
        $device->forceFill(['last_seen_at' => now(), 'offline_notified_at' => null])->save();

        if ($request->filled('states')) {
            $this->commands->syncStates($device, self::parseStates((string) $request->query('states')));
        }

        return response()->json(self::payload($this->commands, $device));
    }

    /**
     * POST /device/commands/{command}/ack — {"ok": true, "message": null, "states": "1:1,2:0"}
     */
    public function ack(Request $request, ActuatorCommand $command): JsonResponse
    {
        $device = AuthenticateDevice::device($request);
        abort_unless($command->actuator->device_id === $device->id, 404);

        $data = $request->validate([
            'ok' => ['required', 'boolean'],
            'message' => ['nullable', 'string', 'max:191'],
            'states' => ['nullable', 'string', 'max:191'],
        ]);

        $this->commands->acknowledge($command, $data['ok'], $data['message'] ?? null);
        if (! empty($data['states'])) {
            $this->commands->syncStates($device->load('actuators'), self::parseStates($data['states']));
        }

        return response()->json(['status' => $command->fresh()->status]);
    }

    /**
     * Lệnh đang chờ, gửi kèm cả phản hồi /ingest (mạch đo + điều khiển chung 1 bo đỡ phải hỏi riêng).
     *
     * @return array{commands: list<array<string, mixed>>, poll_seconds: int, server_time: int}
     */
    public static function payload(CommandService $commands, Device $device): array
    {
        return [
            'commands' => $commands->pendingFor($device)->map->forDevice()->values()->all(),
            'poll_seconds' => config('iot.control.poll_seconds'),
            'server_time' => now()->getTimestamp(),
        ];
    }

    /**
     * "1:1,2:0" -> [1 => true, 2 => false]
     *
     * @return array<int, bool>
     */
    public static function parseStates(string $states): array
    {
        $result = [];
        foreach (explode(',', $states) as $pair) {
            [$channel, $state] = array_pad(explode(':', trim($pair), 2), 2, null);
            if (is_numeric($channel) && in_array($state, ['0', '1'], true)) {
                $result[(int) $channel] = $state === '1';
            }
        }

        return $result;
    }
}
