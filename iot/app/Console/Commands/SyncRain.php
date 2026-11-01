<?php

namespace App\Console\Commands;

use App\Models\Farm;
use App\Services\Rain\RainHistory;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Throwable;

#[Signature('weather:sync-rain {--days=2 : Lấy lại N ngày gần nhất} {--farm= : Chỉ 1 trang trại}')]
#[Description('Lưu lượng mưa từng ngày tại vị trí các trang trại (Open-Meteo)')]
class SyncRain extends Command
{
    public function handle(RainHistory $history): int
    {
        $farms = Farm::query()->whereNotNull('lat')->whereNotNull('lng')
            ->when($this->option('farm'), fn ($query, $id) => $query->whereKey($id))
            ->get();

        $failed = 0;
        foreach ($farms as $farm) {
            try {
                $saved = $history->sync($farm, max(1, (int) $this->option('days')));
                $this->line("{$farm->name}: {$saved} ngày");
            } catch (Throwable $e) {
                report($e);
                $failed++;
                $this->warn("{$farm->name}: lỗi {$e->getMessage()}");
            }
        }

        return $failed > 0 ? self::FAILURE : self::SUCCESS;
    }
}
