<?php

namespace App\Services\Mqtt;

use App\Enums\ReadingSource;
use App\Http\Controllers\Api\V1\DeviceCommandController;
use App\Models\ActuatorCommand;
use App\Models\Device;
use App\Services\Control\CommandService;
use App\Services\ReadingIngestor;
use Illuminate\Support\Facades\Log;

/**
 * Xử lý bản tin thiết bị gửi lên MQTT (iot:mqtt-listen gọi; test gọi thẳng, không cần broker). Mọi bản tin kèm khóa thiết bị ("key").
 *
 *  - nhanong/{uid}/up : số đo, giống POST /ingest
 *    {"key": "ndk_...", "firmware": "1.0.0", "readings": [{"metric": "soil_ph", "value": 6.4, "t": 1730170000}]}
 *  - nhanong/{uid}/ack: mạch điều khiển báo kết quả lệnh, giống POST /device/commands/{id}/ack
 *    {"key": "ndk_...", "id": 12, "ok": true, "message": null, "states": "1:1,2:0"}
 *    Không có "id" = chỉ báo trạng thái relay (mạch vừa nối MQTT xong).
 *
 * Bản tin hợp lệ thì ghi mqtt_seen_at: máy chủ biết mạch đang nghe MQTT để đẩy lệnh xuống nhanong/{uid}/down.
 */
class MqttInbox
{
    public function __construct(private readonly ReadingIngestor $ingestor, private readonly CommandService $commands) {}

    /**
     * @return string|null mô tả ngắn để in ra màn hình; null = bỏ qua (sai khóa / sai định dạng)
     */
    public function handle(string $topic, string $message): ?string
    {
        [$prefix, $uid, $kind] = array_pad(explode('/', $topic, 3), 3, '');
        $payload = json_decode($message, true);
        $device = $prefix === 'nhanong' && $uid !== '' ? Device::query()->where('uid', $uid)->first() : null;

        if (! is_array($payload) || $device === null || $device->api_key_hash === null
            || ! hash_equals($device->api_key_hash, hash('sha256', (string) ($payload['key'] ?? '')))) {
            Log::notice('MQTT: bỏ qua bản tin không hợp lệ', ['topic' => $topic]);

            return null;
        }

        $device->mqtt_seen_at = now();

        return match ($kind) {
            'up' => $this->readings($device, $payload),
            'ack' => $this->ack($device, $payload),
            default => null,
        };
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function readings(Device $device, array $payload): string
    {
        // ingestPayload lưu thiết bị (last_seen_at) kèm mqtt_seen_at
        $result = $this->ingestor->ingestPayload($device, $payload, ReadingSource::Mqtt);

        return sprintf('%s: nhận %d, trùng %d, loại %d', $device->uid, $result->accepted, $result->duplicates, count($result->rejected));
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function ack(Device $device, array $payload): string
    {
        $device->forceFill(['last_seen_at' => now(), 'offline_notified_at' => null])->save();

        $id = $payload['id'] ?? null;
        $result = 'trạng thái';
        if (is_int($id) || (is_string($id) && ctype_digit($id))) {
            $command = ActuatorCommand::query()->with('actuator')->find((int) $id);
            if ($command === null || $command->actuator->device_id !== $device->id) {
                Log::notice('MQTT: báo kết quả cho lệnh không phải của thiết bị', ['uid' => $device->uid, 'id' => $id]);

                return "{$device->uid}: lệnh #{$id} không có";
            }
            $ok = filter_var($payload['ok'] ?? false, FILTER_VALIDATE_BOOLEAN);
            $message = is_string($payload['message'] ?? null) ? $payload['message'] : null;
            // Mạch báo lại lệnh đã làm (gửi lại qua HTTP / MQTT): acknowledge bỏ qua lệnh đã đóng
            $this->commands->acknowledge($command, $ok, $message);
            $result = "lệnh #{$command->id} ".($ok ? 'đã làm' : 'lỗi');
        }

        if (is_string($payload['states'] ?? null) && $payload['states'] !== '') {
            $this->commands->syncStates($device->load('actuators'), DeviceCommandController::parseStates(mb_substr($payload['states'], 0, 191)));
        }

        return "{$device->uid}: {$result}";
    }
}
