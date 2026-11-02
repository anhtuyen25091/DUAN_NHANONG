<?php

namespace App\Services\Mqtt;

use App\Models\ActuatorCommand;
use App\Models\Device;
use RuntimeException;

/**
 * Đẩy lệnh bật / tắt + cấu hình từ xa xuống mạch ESP32 dùng MQTT, topic nhanong/{uid}/down (QoS 1, không giữ lại).
 *
 * Bản tin: {"data": "<chuỗi JSON>", "sig": "<HMAC-SHA256 của data bằng khóa thiết bị>"}
 * data giống phản hồi GET /device/commands để firmware dùng chung 1 hàm xử lý:
 *   {"commands": [{"id": 12, "channel": 1, "action": "on", "minutes": 30}], "server_time": ..., "exp": ..., "config": {...}, "firmware_update": {...}}
 * Thiết bị dùng chung 1 tài khoản MQTT nên chữ ký giúp mạch chỉ làm lệnh do máy chủ gửi; "exp" chặn bản tin cũ bị phát lại.
 * Không "retain": lệnh giữ lại trên broker sẽ chạy lại mỗi lần mạch kết nối lại (mạch chỉ nhớ 16 id lệnh gần nhất).
 */
class MqttDownlink
{
    public function __construct(private readonly MqttPublisher $publisher) {}

    public static function topic(Device $device): string
    {
        return "nhanong/{$device->uid}/down";
    }

    /**
     * @throws RuntimeException không gửi được (broker lỗi / không xác nhận)
     */
    public function sendCommand(ActuatorCommand $command): void
    {
        $device = $command->actuator->device;
        $this->publish($device, [
            'commands' => [$command->forDevice()],
            'server_time' => now()->getTimestamp(),
            'exp' => $command->expires_at->getTimestamp(),
        ] + $device->syncPayload());
    }

    /**
     * Chỉ cấu hình từ xa + bản firmware mới (đổi chu kỳ đo, tải firmware lên trang quản trị).
     *
     * @throws RuntimeException
     */
    public function sendSync(Device $device): void
    {
        $this->publish($device, [
            'commands' => [],
            'server_time' => now()->getTimestamp(),
            'exp' => now()->addMinutes(config('iot.control.command_ttl_minutes'))->getTimestamp(),
        ] + $device->syncPayload());
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function publish(Device $device, array $data): void
    {
        $json = json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        $message = json_encode(['data' => $json, 'sig' => $device->sign($json)], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);

        $this->publisher->publish(self::topic($device), $message);
    }
}
