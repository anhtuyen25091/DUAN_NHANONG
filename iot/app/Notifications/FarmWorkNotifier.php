<?php

namespace App\Notifications;

use App\Models\PlotEvent;

/**
 * Báo mọi người của trang trại (chủ, người nhà, người làm công) khi lô vừa phun thuốc / bón phân,
 * và nhắc việc đã lên kế hoạch vào sáng hôm đó.
 */
class FarmWorkNotifier
{
    public function __construct(private readonly ExpoPushClient $client) {}

    public function recorded(PlotEvent $event): int
    {
        $event->loadMissing('plot.farm', 'user');
        $plot = $event->plot;
        $who = $event->user ? " ({$event->user->name} ghi)" : '';

        if ($event->kind === PlotEvent::SPRAY) {
            $parts = array_filter([
                $event->noEntryUntil() ? '⛔ Không vào lô tới '.$event->noEntryUntil()->setTimezone('Asia/Ho_Chi_Minh')->format('H:i d/m') : null,
                $event->harvestFrom() ? 'Thu hoạch từ '.$event->harvestFrom()->format('d/m') : null,
                'Tạm dừng tưới trên tán tới '.$event->canopyPauseUntil()->setTimezone('Asia/Ho_Chi_Minh')->format('H:i d/m'),
            ]);

            return $this->send($event, "🧴 {$plot->name}: vừa phun {$event->title}", implode('. ', $parts).'.'.$who);
        }

        if ($event->kind === PlotEvent::FERTILIZE) {
            return $this->send($event, "🌱 {$plot->name}: vừa bón {$event->title}", 'Vài ngày tới độ dẫn điện (EC), đạm, lân, kali của đất có thể tăng, không phải cảm biến hỏng.'.$who);
        }

        return 0;
    }

    /**
     * @param  array{level: string, items: list<array{level: string, text: string}>}|null  $advice
     */
    public function planned(PlotEvent $event, ?array $advice): int
    {
        $event->loadMissing('plot.farm');
        $label = [PlotEvent::SPRAY => 'phun', PlotEvent::FERTILIZE => 'bón', PlotEvent::WATER => 'tưới', PlotEvent::PRUNE => 'tỉa cành, làm cỏ:'][$event->kind] ?? 'việc:';
        $time = $event->done_at->setTimezone('Asia/Ho_Chi_Minh')->format('H:i');
        $note = $advice && $advice['level'] !== 'ok'
            ? collect($advice['items'])->where('level', '!=', 'info')->pluck('text')->first()
            : null;

        return $this->send($event, "📅 Hôm nay {$time}: {$label} {$event->title} ({$event->plot->name})", $note ?? 'Làm xong nhớ bấm "Đã làm" để ghi vào nhật ký.');
    }

    private function send(PlotEvent $event, string $title, string $body): int
    {
        $tokens = $event->plot->farm->recipientTokens();

        return $tokens->isEmpty() ? 0 : $this->client->send($tokens, $title, $body, ['iotPlotId' => $event->plot_id]);
    }
}
