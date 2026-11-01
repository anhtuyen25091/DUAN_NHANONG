<?php

namespace App\Services\Control;

use App\Enums\CommandStatus;
use App\Models\ActuatorCommand;
use App\Models\AutomationRule;
use App\Models\Device;
use App\Models\Metric;
use App\Notifications\ControlNotifier;

/**
 * Chạy luật tự động với số đo mới nhất của lô:
 * - Vượt mức (VD DO < 4) mà thiết bị đang tắt, đã qua thời gian nghỉ → bật `minutes` phút, báo chủ trang trại.
 * - Trở lại mức an toàn (off_value) → tắt, nhưng chỉ khi lần bật gần nhất là do chính luật này (không tắt máy người dùng bật tay).
 */
class RuleEngine
{
    public function __construct(private readonly CommandService $commands, private readonly ControlNotifier $notifier) {}

    /**
     * @param  array<int, array{value: float, measured_at: string}>  $latest  số đo mới nhất theo metric_id
     */
    public function evaluate(Device $device, array $latest): void
    {
        if ($device->plot_id === null || $latest === []) {
            return;
        }

        $rules = AutomationRule::query()
            ->with(['actuator.openCommand', 'metric'])
            ->where('plot_id', $device->plot_id)
            ->where('enabled', true)
            ->whereIn('metric_id', array_keys($latest))
            ->get();

        foreach ($rules as $rule) {
            $value = $latest[$rule->metric_id]['value'];
            $actuator = $rule->actuator;
            $open = $actuator->openCommand;
            $turningOn = $actuator->is_on || $open?->action === ActuatorCommand::ON;

            if ($rule->shouldTurnOn($value)) {
                $cooledDown = $rule->last_triggered_at === null || $rule->last_triggered_at->lt(now()->subMinutes($rule->cooldown_minutes));
                if ($turningOn || ! $cooledDown) {
                    continue;
                }
                $rule->forceFill(['last_triggered_at' => now()])->save();
                try {
                    $command = $this->commands->issue($actuator, ActuatorCommand::ON, $rule->minutes, ActuatorCommand::SOURCE_RULE, rule: $rule, reason: $this->reason($rule->metric, $value, $rule));
                    $this->notifier->ruleTurnedOn($rule, $command, $value);
                } catch (BlockedCommandException $e) {
                    // Báo 1 lần mỗi thời gian nghỉ của luật (last_triggered_at đã cập nhật)
                    $this->notifier->blocked($actuator, $e->getMessage());
                }
            } elseif ($rule->shouldTurnOff($value) && $turningOn && $this->lastOnBy($rule)) {
                $this->commands->issue($actuator, ActuatorCommand::OFF, null, ActuatorCommand::SOURCE_RULE, rule: $rule, reason: $this->reason($rule->metric, $value, $rule, true));
            }
        }
    }

    /** Lần bật gần nhất (đang chờ hoặc đã làm) là do luật này */
    private function lastOnBy(AutomationRule $rule): bool
    {
        $lastOn = $rule->actuator->commands()
            ->where('action', ActuatorCommand::ON)
            ->whereIn('status', [CommandStatus::Pending, CommandStatus::Sent, CommandStatus::Done])
            ->latest('id')
            ->first();

        return $lastOn?->rule_id === $rule->id;
    }

    private function reason(Metric $metric, float $value, AutomationRule $rule, bool $off = false): string
    {
        $n = fn (float $v) => rtrim(rtrim(number_format($v, 2, ',', '.'), '0'), ',');
        $unit = $metric->unit ? " {$metric->unit}" : '';
        if ($off) {
            return "{$metric->name} {$n($value)}{$unit}, đã về mức ".($rule->operator === AutomationRule::BELOW ? '≥' : '≤')." {$n($rule->off_value)}";
        }

        return "{$metric->name} {$n($value)}{$unit} ".($rule->operator === AutomationRule::BELOW ? '<' : '>')." {$n($rule->value)}";
    }
}
