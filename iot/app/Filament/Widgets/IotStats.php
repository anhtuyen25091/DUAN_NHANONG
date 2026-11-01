<?php

namespace App\Filament\Widgets;

use App\Models\Alert;
use App\Models\Device;
use App\Models\Reading;
use Filament\Widgets\StatsOverviewWidget;
use Filament\Widgets\StatsOverviewWidget\Stat;

/**
 * Trang chủ admin: tình trạng thiết bị và dữ liệu về trong 24 giờ.
 */
class IotStats extends StatsOverviewWidget
{
    protected static ?int $sort = 1;

    protected function getStats(): array
    {
        $since = now()->subDay();
        $offlineSince = now()->subHours(config('iot.offline_after_hours'));
        $total = Device::query()->count();
        $online = Device::query()->where('last_seen_at', '>=', $offlineSince)->count();

        return [
            Stat::make('Thiết bị trực tuyến', "{$online} / {$total}")
                ->description(($total - $online).' thiết bị chưa gửi dữ liệu trong '.config('iot.offline_after_hours').' giờ')
                ->color($online < $total ? 'warning' : 'success'),
            Stat::make('Số đo nhận trong 24 giờ', number_format(Reading::query()->where('received_at', '>=', $since)->count(), 0, ',', '.'))
                ->description(number_format(Reading::query()->where('received_at', '>=', $since)->whereColumn('measured_at', '<', 'received_at')->where('measured_at', '<', now()->subHour())->count(), 0, ',', '.').' số đo gửi bù (đo trước đó hơn 1 giờ)'),
            Stat::make('Cảnh báo đang mở', (string) Alert::query()->open()->count())
                ->color(Alert::query()->open()->exists() ? 'danger' : 'success'),
        ];
    }
}
