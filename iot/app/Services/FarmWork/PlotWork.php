<?php

namespace App\Services\FarmWork;

use App\Models\Actuator;
use App\Models\ActuatorCommand;
use App\Models\Plot;
use App\Models\PlotEvent;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

/**
 * Trạng thái của lô sau các việc đã làm: đang cấm vào lô, còn cách ly thu hoạch, đang tạm dừng tưới trên tán
 * (vừa phun thuốc), vừa bón phân. Và tự ghi nhật ký tưới khi máy bơm chạy.
 */
class PlotWork
{
    /** Việc cũ hơn ngần này ngày không còn ảnh hưởng (cách ly dài nhất trên nhãn thuốc thường dưới 60 ngày) */
    private const LOOKBACK_DAYS = 120;

    /**
     * @return array{no_entry_until: ?string, no_entry_event: ?array<string, mixed>, harvest_from: ?string, harvest_event: ?array<string, mixed>,
     *     canopy_paused_until: ?string, spray_event: ?array<string, mixed>, fertilized_at: ?string, fertilize_event: ?array<string, mixed>, planned: int}
     */
    public function status(Plot $plot): array
    {
        return $this->statuses(collect([$plot]))[$plot->id];
    }

    /**
     * @param  Collection<int, Plot>  $plots
     * @return array<int, array<string, mixed>> theo plot_id
     */
    public function statuses(Collection $plots): array
    {
        $now = CarbonImmutable::now();
        $events = PlotEvent::query()
            ->whereIn('plot_id', $plots->pluck('id'))
            ->where('done_at', '>=', $now->subDays(self::LOOKBACK_DAYS))
            ->orderBy('done_at')
            ->get()
            ->groupBy('plot_id');
        $quietDays = (int) config('iot.farm_work.fertilize_alert_quiet_days');

        $result = [];
        foreach ($plots as $plot) {
            $list = $events[$plot->id] ?? collect();
            $done = $list->filter(fn (PlotEvent $e) => ! $e->planned && $e->done_at->lte($now));

            $noEntry = $done->filter(fn (PlotEvent $e) => $e->noEntryUntil()?->gt($now))->sortByDesc(fn (PlotEvent $e) => $e->noEntryUntil())->first();
            $harvest = $done->filter(fn (PlotEvent $e) => $e->harvestFrom()?->gt($now))->sortByDesc(fn (PlotEvent $e) => $e->harvestFrom())->first();
            $spray = $done->filter(fn (PlotEvent $e) => $e->canopyPauseUntil()?->gt($now))->sortByDesc(fn (PlotEvent $e) => $e->canopyPauseUntil())->first();
            $fertilize = $done->filter(fn (PlotEvent $e) => $e->kind === PlotEvent::FERTILIZE && $e->done_at->gt($now->subDays($quietDays)))->last();

            $result[$plot->id] = [
                'no_entry_until' => $noEntry?->noEntryUntil()->toIso8601String(),
                'no_entry_event' => $noEntry ? $this->brief($noEntry) : null,
                'harvest_from' => $harvest?->harvestFrom()->toDateString(),
                'harvest_event' => $harvest ? $this->brief($harvest) : null,
                'canopy_paused_until' => $spray?->canopyPauseUntil()->toIso8601String(),
                'spray_event' => $spray ? $this->brief($spray) : null,
                'fertilized_at' => $fertilize?->done_at->toIso8601String(),
                'fertilize_event' => $fertilize ? $this->brief($fertilize) : null,
                'planned' => $list->filter(fn (PlotEvent $e) => $e->planned)->count(),
            ];
        }

        return $result;
    }

    /** Lần phun thuốc đang làm máy tưới trên tán phải tạm dừng (null = không dừng) */
    public function canopyPause(Actuator $actuator): ?PlotEvent
    {
        if ($actuator->plot_id === null || ! $actuator->wetsCanopy()) {
            return null;
        }
        $now = CarbonImmutable::now();

        return PlotEvent::query()
            ->where('plot_id', $actuator->plot_id)
            ->where('kind', PlotEvent::SPRAY)
            ->done()
            ->where('done_at', '>=', $now->subDays(3))
            ->get()
            ->filter(fn (PlotEvent $e) => $e->canopyPauseUntil()->gt($now))
            ->sortByDesc(fn (PlotEvent $e) => $e->canopyPauseUntil())
            ->first();
    }

    /** Lần bón phân gần đây làm EC / đạm / lân / kali tăng (null = không có) */
    public function recentFertilize(int $plotId): ?PlotEvent
    {
        return PlotEvent::query()
            ->where('plot_id', $plotId)
            ->where('kind', PlotEvent::FERTILIZE)
            ->done()
            ->where('done_at', '>=', now()->subDays((int) config('iot.farm_work.fertilize_alert_quiet_days')))
            ->latest('done_at')
            ->first();
    }

    /** Máy bơm / van / phun sương đã bật xong: ghi 1 dòng "tưới" vào nhật ký lô */
    public function logWater(ActuatorCommand $command): ?PlotEvent
    {
        $actuator = $command->actuator;
        if ($command->action !== ActuatorCommand::ON || $actuator->plot_id === null || ! in_array($actuator->kind->value, config('iot.farm_work.log_water_kinds'), true)) {
            return null;
        }

        $sources = [
            ActuatorCommand::SOURCE_MANUAL => 'bật tay',
            ActuatorCommand::SOURCE_RULE => 'luật tự động',
            ActuatorCommand::SOURCE_SCHEDULE => 'lịch tưới',
        ];

        return PlotEvent::query()->create([
            'uuid' => (string) Str::uuid(),
            'plot_id' => $actuator->plot_id,
            'user_id' => $command->user_id,
            'kind' => PlotEvent::WATER,
            'title' => "{$actuator->name} chạy {$command->minutes} phút",
            'note' => isset($sources[$command->source]) ? "Tự ghi ({$sources[$command->source]})" : 'Tự ghi',
            'done_at' => now(),
            'source' => PlotEvent::SOURCE_ACTUATOR,
            'actuator_id' => $actuator->id,
            'minutes' => $command->minutes,
        ]);
    }

    /**
     * @return array{id: int, uuid: string, kind: string, title: string, done_at: string}
     */
    private function brief(PlotEvent $event): array
    {
        return ['id' => $event->id, 'uuid' => $event->uuid, 'kind' => $event->kind, 'title' => $event->title, 'done_at' => $event->done_at->toIso8601String()];
    }
}
