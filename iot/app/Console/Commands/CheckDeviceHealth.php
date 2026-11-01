<?php

namespace App\Console\Commands;

use App\Models\Device;
use App\Notifications\DeviceHealthNotifier;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('devices:check-health')]
#[Description('Báo chủ trang trại khi thiết bị mất kết nối quá lâu hoặc sắp hết pin (mỗi sự cố báo 1 lần)')]
class CheckDeviceHealth extends Command
{
    public function handle(DeviceHealthNotifier $notifier): int
    {
        $relations = ['plot', 'farm.user.pushTokens'];

        $offline = Device::query()->with($relations)
            ->whereNotNull('last_seen_at')
            ->where('last_seen_at', '<', now()->subHours(config('iot.offline_after_hours')))
            ->whereNull('offline_notified_at')
            ->get();
        foreach ($offline as $device) {
            $notifier->offline($device);
            $device->forceFill(['offline_notified_at' => now()])->save();
        }

        $lowBattery = Device::query()->with($relations)
            ->where('battery', '<', config('iot.low_battery_percent'))
            ->whereNull('low_battery_notified_at')
            ->get();
        foreach ($lowBattery as $device) {
            $notifier->lowBattery($device);
            $device->forceFill(['low_battery_notified_at' => now()])->save();
        }

        $this->info("Mất kết nối: {$offline->count()} thiết bị, sắp hết pin: {$lowBattery->count()} thiết bị.");

        return self::SUCCESS;
    }
}
