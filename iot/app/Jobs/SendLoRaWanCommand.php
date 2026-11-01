<?php

namespace App\Jobs;

use App\Enums\CommandStatus;
use App\Models\ActuatorCommand;
use App\Services\Control\CommandService;
use App\Services\LoRaWan\DownlinkSender;
use App\Services\LoRaWan\RelayCodec;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use RuntimeException;

/**
 * Gửi lệnh bật / tắt xuống mạch relay LoRaWAN. Mạch làm xong gửi lên trạng thái relay → lệnh thành "đã làm".
 * Không thử lại tự động: lệnh bật / tắt gửi trễ có thể nguy hiểm hơn là báo lỗi cho người dùng bấm lại.
 */
class SendLoRaWanCommand implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public function __construct(public int $commandId) {}

    public function handle(DownlinkSender $sender, CommandService $commands): void
    {
        $command = ActuatorCommand::query()->with('actuator.device')->find($this->commandId);
        if ($command === null || $command->status !== CommandStatus::Pending) {
            return;
        }
        $actuator = $command->actuator;
        $bytes = RelayCodec::encode($actuator->device->profile, $actuator->channel, $command->action === ActuatorCommand::ON);
        if ($bytes === null) {
            $commands->acknowledge($command, false, 'Dòng mạch LoRaWAN này chưa hỗ trợ điều khiển (hoặc sai kênh relay).');

            return;
        }

        try {
            $sender->send($actuator->device, $bytes);
        } catch (RuntimeException $e) {
            $commands->acknowledge($command, false, $e->getMessage());

            return;
        }

        $command->update(['status' => CommandStatus::Sent, 'sent_at' => now()]);
    }
}
