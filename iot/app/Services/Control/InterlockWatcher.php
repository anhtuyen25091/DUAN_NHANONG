<?php

namespace App\Services\Control;

use App\Models\Actuator;
use App\Models\ActuatorCommand;
use App\Models\Device;
use App\Notifications\ControlNotifier;

/**
 * Số đo mới của cảm biến nguồn nước: thiết bị nào dùng cảm biến này làm khóa an toàn mà đang chạy (hoặc đang chờ bật)
 * và số đo vượt mức thì tắt ngay, báo chủ trang trại.
 */
class InterlockWatcher
{
    public function __construct(private readonly CommandService $commands, private readonly ControlNotifier $notifier) {}

    /**
     * @param  array<int, array{value: float, measured_at: string}>  $latest  số đo mới nhất theo metric_id
     */
    public function onReadings(Device $device, array $latest): void
    {
        $actuators = Actuator::query()
            ->with(['openCommand', 'blockMetric', 'blockDevice', 'device.farm'])
            ->where('block_device_id', $device->id)
            ->whereIn('block_metric_id', array_keys($latest))
            ->whereNotNull('block_value')
            ->get();

        foreach ($actuators as $actuator) {
            $value = $latest[$actuator->block_metric_id]['value'];
            $running = $actuator->is_on || $actuator->openCommand?->action === ActuatorCommand::ON;
            $alreadyStopping = $actuator->openCommand?->action === ActuatorCommand::OFF && $actuator->openCommand->status->isOpen();
            if (! $actuator->blockedBy($value) || ! $running || $alreadyStopping) {
                continue;
            }

            $reason = InterlockGuard::describe($actuator, $value);
            $this->commands->issue($actuator, ActuatorCommand::OFF, null, ActuatorCommand::SOURCE_SAFETY, reason: $reason);
            $this->notifier->safetyOff($actuator, $reason);
        }
    }
}
