<?php

namespace App\Notifications;

use App\Models\Actuator;
use App\Models\ActuatorCommand;
use App\Models\AutomationRule;
use App\Models\Farm;

/**
 * Báo chủ trang trại về điều khiển: luật tự bật thiết bị, lệnh không tới được mạch / mạch báo lỗi.
 */
class ControlNotifier
{
    public function __construct(private readonly ExpoPushClient $client) {}

    public function ruleTurnedOn(AutomationRule $rule, ActuatorCommand $command, float $value): int
    {
        $actuator = $rule->actuator;

        return $this->send(
            $actuator->device->farm,
            "⚙️ Tự bật {$actuator->name}".($rule->plot ? " ({$rule->plot->name})" : ''),
            "Vì {$command->reason}. Chạy {$command->minutes} phút".($rule->off_value !== null ? ' hoặc tới khi số đo trở lại bình thường' : '').'.',
            $actuator->plot_id ?? $rule->plot_id,
        );
    }

    public function commandExpired(ActuatorCommand $command): int
    {
        $actuator = $command->actuator;
        $verb = $command->action === ActuatorCommand::ON ? 'bật' : 'tắt';

        return $this->send(
            $actuator->device->farm,
            "Chưa {$verb} được {$actuator->name}",
            "Mạch điều khiển \"{$actuator->device->name}\" không nhận lệnh trong ".config('iot.control.command_ttl_minutes').' phút (mất điện / mất mạng?). Lệnh đã hủy, không tự chạy muộn.',
            $actuator->plot_id,
        );
    }

    public function commandFailed(ActuatorCommand $command): int
    {
        $actuator = $command->actuator;

        return $this->send(
            $actuator->device->farm,
            "Lỗi điều khiển {$actuator->name}",
            'Mạch báo không làm được'.($command->message ? ": {$command->message}" : '.'),
            $actuator->plot_id,
        );
    }

    /** Khóa an toàn chặn lượt bật tự động (luật / lịch tưới) */
    public function blocked(Actuator $actuator, string $message): int
    {
        return $this->send($actuator->device->farm, "⛔ Chặn bật {$actuator->name}", $message, $actuator->plot_id);
    }

    /** Đang chạy thì số đo nguồn nước vượt mức: đã tự tắt */
    public function safetyOff(Actuator $actuator, string $reason): int
    {
        return $this->send($actuator->device->farm, "⛔ Đã tự tắt {$actuator->name}", "Vì {$reason}. Chỉ bật lại khi số đo trở lại an toàn.", $actuator->plot_id);
    }

    public function scheduleSkipped(Actuator $actuator, string $reason): int
    {
        return $this->send($actuator->device->farm, "🌧️ Bỏ lượt tưới {$actuator->name}", $reason, $actuator->plot_id);
    }

    private function send(Farm $farm, string $title, string $body, ?int $plotId): int
    {
        $tokens = $farm->user->pushTokens;

        return $tokens->isEmpty() ? 0 : $this->client->send($tokens, $title, $body, array_filter(['iotPlotId' => $plotId]));
    }
}
