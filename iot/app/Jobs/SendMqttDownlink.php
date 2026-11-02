<?php

namespace App\Jobs;

use App\Enums\CommandStatus;
use App\Models\ActuatorCommand;
use App\Models\Device;
use App\Services\Mqtt\MqttDownlink;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Đẩy lệnh bật / tắt (hoặc chỉ cấu hình từ xa khi không có commandId) xuống mạch ESP32 qua MQTT.
 *
 * Khác LoRaWAN: mạch ESP32 vẫn tự hỏi lệnh qua HTTP, nên đẩy không được thì lệnh giữ "chờ gửi" để mạch lấy qua HTTP;
 * mạch không lấy trong hạn thì lệnh quá hạn và báo về điện thoại như cũ. Không thử đẩy lại (tries = 1).
 * Đẩy được cũng giữ "chờ gửi" (chỉ ghi sent_at): broker nhận không có nghĩa mạch đã nhận (mạch có thể đang mất mạng);
 * mạch làm xong báo lên nhanong/{uid}/ack → "đã làm", hoặc lấy qua HTTP → "đã gửi" như cũ.
 */
class SendMqttDownlink implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public function __construct(public int $deviceId, public ?int $commandId = null) {}

    public function handle(MqttDownlink $downlink): void
    {
        try {
            if ($this->commandId === null) {
                $device = Device::query()->find($this->deviceId);
                if ($device !== null) {
                    $downlink->sendSync($device);
                }

                return;
            }

            $command = ActuatorCommand::query()->with('actuator.device')->find($this->commandId);
            // Đã bị lệnh mới thay / mạch đã lấy qua HTTP / đã quá hạn: thôi
            if ($command === null || $command->status !== CommandStatus::Pending || $command->expires_at->isPast()) {
                return;
            }
            $downlink->sendCommand($command);
            $command->update(['sent_at' => now()]);
        } catch (RuntimeException $e) {
            Log::warning('MQTT: không đẩy được xuống thiết bị, chờ mạch tự hỏi qua HTTP', [
                'device_id' => $this->deviceId,
                'command_id' => $this->commandId,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
