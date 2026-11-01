<?php

namespace App\Services\Control;

use App\Enums\CommandStatus;
use App\Models\Actuator;
use App\Models\ActuatorCommand;
use App\Models\AutomationRule;
use App\Models\Device;
use App\Models\User;
use App\Notifications\ControlNotifier;
use Illuminate\Support\Collection;
use InvalidArgumentException;

/**
 * Vòng đời lệnh bật / tắt: tạo (lệnh mới thay lệnh cũ chưa làm) → mạch lấy (sent) → mạch báo đã làm / lỗi (done / failed).
 * Mạch không lấy trước expires_at thì lệnh quá hạn: không làm nữa (VD mất điện 2 giờ, có điện lại không tự bật bơm).
 */
class CommandService
{
    public function __construct(private readonly ControlNotifier $notifier) {}

    public function issue(Actuator $actuator, string $action, ?int $minutes, string $source, ?User $user = null, ?AutomationRule $rule = null, ?string $reason = null): ActuatorCommand
    {
        if (! in_array($action, [ActuatorCommand::ON, ActuatorCommand::OFF], true)) {
            throw new InvalidArgumentException("Lệnh không hợp lệ: {$action}");
        }

        // Bật luôn có giờ tắt (mạch tự tắt khi hết giờ, kể cả lúc mất mạng)
        $minutes = $action === ActuatorCommand::ON ? min(max($minutes ?? $actuator->max_minutes, 1), $actuator->max_minutes) : null;

        $actuator->commands()->whereIn('status', [CommandStatus::Pending, CommandStatus::Sent])->update(['status' => CommandStatus::Replaced]);

        return $actuator->commands()->create([
            'action' => $action,
            'minutes' => $minutes,
            'source' => $source,
            'user_id' => $user?->id,
            'rule_id' => $rule?->id,
            'reason' => $reason,
            'status' => CommandStatus::Pending,
            'expires_at' => now()->addMinutes(config('iot.control.command_ttl_minutes')),
        ]);
    }

    /**
     * Lệnh mạch cần làm. Lệnh đã gửi mà chưa báo kết quả thì gửi lại (mạch bỏ qua id đã làm).
     *
     * @return Collection<int, ActuatorCommand>
     */
    public function pendingFor(Device $device): Collection
    {
        $commands = ActuatorCommand::query()
            ->with('actuator')
            ->whereIn('actuator_id', $device->actuators()->select('id'))
            ->whereIn('status', [CommandStatus::Pending, CommandStatus::Sent])
            ->where('expires_at', '>', now())
            ->orderBy('id')
            ->get();

        ActuatorCommand::query()->whereKey($commands->where('status', CommandStatus::Pending)->modelKeys())
            ->update(['status' => CommandStatus::Sent, 'sent_at' => now()]);

        return $commands;
    }

    /**
     * Mạch báo đã làm (done) hoặc không làm được (failed: relay lỗi, kênh không có...).
     */
    public function acknowledge(ActuatorCommand $command, bool $success, ?string $message = null): void
    {
        if (! $command->status->isOpen()) {
            return;
        }

        $command->update([
            'status' => $success ? CommandStatus::Done : CommandStatus::Failed,
            'message' => $message === null ? null : mb_substr($message, 0, 191),
            'done_at' => now(),
        ]);

        if (! $success) {
            $this->notifier->commandFailed($command);

            return;
        }

        $actuator = $command->actuator;
        $on = $command->action === ActuatorCommand::ON;
        $actuator->forceFill([
            'is_on' => $on,
            'state_changed_at' => now(),
            'auto_off_at' => $on ? now()->addMinutes($command->minutes) : null,
        ])->save();
    }

    /**
     * Trạng thái relay mạch báo về (nguồn đúng nhất: mạch tự tắt khi hết giờ, người dùng bật tay tại chỗ...).
     *
     * @param  array<int, bool>  $states  kênh => đang bật
     */
    public function syncStates(Device $device, array $states): void
    {
        foreach ($device->actuators as $actuator) {
            if (! array_key_exists($actuator->channel, $states) || $actuator->is_on === $states[$actuator->channel]) {
                continue;
            }
            $actuator->forceFill([
                'is_on' => $states[$actuator->channel],
                'state_changed_at' => now(),
                'auto_off_at' => $states[$actuator->channel] ? $actuator->auto_off_at : null,
            ])->save();
        }
    }

    /**
     * Lệnh quá hạn mà mạch chưa lấy: bỏ, báo chủ trang trại.
     *
     * @return int số lệnh quá hạn
     */
    public function expire(): int
    {
        $expired = ActuatorCommand::query()
            ->with('actuator.device.farm.user.pushTokens')
            ->where('status', CommandStatus::Pending)
            ->where('expires_at', '<=', now())
            ->get();

        foreach ($expired as $command) {
            $command->update(['status' => CommandStatus::Expired]);
            $this->notifier->commandExpired($command);
        }

        // Đã gửi mà mạch không báo lại: coi như lỗi
        ActuatorCommand::query()->where('status', CommandStatus::Sent)->where('expires_at', '<=', now())
            ->update(['status' => CommandStatus::Failed, 'message' => 'Mạch không báo kết quả', 'done_at' => now()]);

        return $expired->count();
    }
}
