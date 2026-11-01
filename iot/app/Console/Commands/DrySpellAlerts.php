<?php

namespace App\Console\Commands;

use App\Models\Farm;
use App\Notifications\DryNotifier;
use App\Services\Irrigation\DrySpell;
use App\Services\Weather\WeatherService;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Throwable;

/**
 * Mỗi sáng: trang trại nào đã dry_alert_days ngày liên tiếp không mưa thì nhắc; khô tiếp thì 3 ngày nhắc lại 1 lần.
 */
#[Signature('weather:dry-spell')]
#[Description('Nhắc chủ vườn khi đã nhiều ngày liên tiếp không mưa')]
class DrySpellAlerts extends Command
{
    private const REPEAT_DAYS = 3;

    public function handle(DrySpell $drySpell, DryNotifier $notifier, WeatherService $weather): int
    {
        $farms = Farm::query()->with(['user.pushTokens', 'plots'])->whereNotNull('lat')->whereNotNull('lng')->where('dry_alert_days', '>', 0)->get();
        $sent = 0;

        foreach ($farms as $farm) {
            $days = $drySpell->days($farm);
            if ($days < $farm->dry_alert_days) {
                // Đã mưa lại: lần khô sau báo từ đầu
                if ($farm->dry_alerted_at !== null) {
                    $farm->forceFill(['dry_alerted_at' => null])->save();
                }

                continue;
            }
            if ($farm->dry_alerted_at?->gt(now()->subDays(self::REPEAT_DAYS)->addHour())) {
                continue;
            }

            $notifier->send($farm, $days, $drySpell->total($farm, $days), $this->forecast($weather, $farm));
            $farm->forceFill(['dry_alerted_at' => now()])->save();
            $sent++;
        }

        $this->info("Đã nhắc {$sent} trang trại.");

        return self::SUCCESS;
    }

    /** "Dự báo 3 ngày tới: mưa khoảng 12 mm." / "...: hầu như không mưa." */
    private function forecast(WeatherService $weather, Farm $farm): ?string
    {
        try {
            $mm = collect($weather->forecast($farm)['daily'])->slice(0, 3)->sum('rain_mm');
        } catch (Throwable) {
            return null;
        }

        return $mm < 1 ? 'Dự báo 3 ngày tới: hầu như không mưa.' : 'Dự báo 3 ngày tới: mưa khoảng '.number_format($mm, 0, ',', '.').' mm.';
    }
}
