<?php

namespace App\Console\Commands;

use App\Models\Farm;
use App\Services\Rain\RainAlerter;
use App\Services\Weather\OpenMeteo;
use Carbon\CarbonImmutable;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Throwable;

#[Signature('weather:rain-watch')]
#[Description('Kiểm tra mưa tại vị trí các trang trại (15 phút / lần), báo chủ vườn khi bắt đầu mưa')]
class RainWatch extends Command
{
    /** Số vị trí mỗi lần gọi Open-Meteo */
    private const BATCH = 50;

    public function handle(OpenMeteo $openMeteo, RainAlerter $alerter): int
    {
        $farms = Farm::query()->with('user.pushTokens')->whereNotNull('lat')->whereNotNull('lng')->get();
        $raining = 0;

        foreach ($farms->chunk(self::BATCH) as $chunk) {
            $chunk = $chunk->values();
            try {
                $current = $openMeteo->currentRain($chunk->map(fn (Farm $farm) => [$farm->lat, $farm->lng])->all());
            } catch (Throwable $e) {
                report($e);

                continue;
            }

            foreach ($chunk as $i => $farm) {
                $observation = $current[$i] ?? null;
                if ($observation === null) {
                    continue;
                }
                $alerter->observe($farm, $observation['mm'], CarbonImmutable::parse($observation['time'], OpenMeteo::TIMEZONE));
                $raining += $farm->raining_since !== null ? 1 : 0;
            }
        }

        $this->info("Đã kiểm tra {$farms->count()} trang trại, {$raining} nơi đang mưa.");

        return self::SUCCESS;
    }
}
