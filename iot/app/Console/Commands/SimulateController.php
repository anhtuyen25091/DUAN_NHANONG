<?php

namespace App\Console\Commands;

use App\Models\Actuator;
use App\Models\ActuatorCommand;
use App\Models\Device;
use App\Services\Control\CommandService;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

/**
 * Giả lập mạch điều khiển relay khi chưa có phần cứng: hỏi lệnh mỗi vài giây, bật / tắt "relay", báo kết quả,
 * tự tắt khi hết số phút — giống firmware ở chế độ CONTROLLER_MODE.
 */
#[Signature('iot:simulate-controller
    {device : Mã mạch điều khiển (uid)}
    {--for=0 : Chạy bao nhiêu giây (0 = tới khi bấm Ctrl+C)}
    {--poll=3 : Số giây giữa 2 lần hỏi lệnh}')]
#[Description('Giả lập mạch điều khiển relay (nhận lệnh bật / tắt máy bơm, quạt oxy...)')]
class SimulateController extends Command
{
    public function handle(CommandService $commands): int
    {
        $device = Device::query()->with('actuators')->where('uid', $this->argument('device'))->first();
        if ($device === null || $device->actuators->isEmpty()) {
            $this->error('Không thấy mạch, hoặc mạch chưa gắn thiết bị điều khiển nào.');

            return self::FAILURE;
        }

        $this->info("Mạch {$device->name}: ".$device->actuators->map(fn (Actuator $a) => "kênh {$a->channel} = {$a->name}")->implode(', '));
        $relays = $device->actuators->mapWithKeys(fn (Actuator $a) => [$a->channel => false])->all();
        $offAt = [];
        $stopAt = (int) $this->option('for') > 0 ? now()->addSeconds((int) $this->option('for')) : null;

        while ($stopAt === null || now()->lt($stopAt)) {
            foreach ($offAt as $channel => $time) {
                if (now()->gte($time)) {
                    $relays[$channel] = false;
                    unset($offAt[$channel]);
                    $this->line(now()->format('H:i:s')." kênh {$channel}: hết giờ, tự TẮT");
                }
            }

            $device->forceFill(['last_seen_at' => now(), 'offline_notified_at' => null])->save();
            $commands->syncStates($device->load('actuators'), $relays);

            foreach ($commands->pendingFor($device) as $command) {
                $channel = $command->actuator->channel;
                $on = $command->action === ActuatorCommand::ON;
                $relays[$channel] = $on;
                $on ? $offAt[$channel] = now()->addMinutes($command->minutes) : $offAt = array_diff_key($offAt, [$channel => true]);
                $commands->acknowledge($command, true);
                $this->line(now()->format('H:i:s')." kênh {$channel} ({$command->actuator->name}): ".($on ? "BẬT {$command->minutes} phút" : 'TẮT').($command->reason ? " — {$command->reason}" : ''));
            }

            sleep(max(1, (int) $this->option('poll')));
        }

        return self::SUCCESS;
    }
}
