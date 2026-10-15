<?php

namespace App\Alerts;

use App\Enums\AlertCondition;
use App\Models\Device;
use App\Models\PriceAlert;
use App\Queries\PriceBoard;
use Carbon\CarbonImmutable;

/**
 * Kiểm tra các cảnh báo giá và gửi thông báo.
 * - Khi giá thay đổi: báo 1 lần cho mỗi ngày có giá mới khác lần trước.
 * - Lên tới / xuống tới ngưỡng: báo 1 lần khi vượt ngưỡng; giá quay lại thì lần vượt sau mới báo tiếp.
 */
class PriceAlertEvaluator
{
    private const LOOKBACK_DAYS = 14;

    public function __construct(
        private PriceBoard $board,
        private ExpoPushClient $push,
    ) {}

    /**
     * @return int số thông báo đã gửi
     */
    public function run(?CarbonImmutable $today = null): int
    {
        $today ??= CarbonImmutable::today();
        $messages = [];

        PriceAlert::query()
            ->whereHas('device', fn ($query) => $query->whereNotNull('push_token'))
            ->with(['device', 'product', 'region'])
            ->orderBy('id')
            ->chunkById(500, function ($alerts) use ($today, &$messages): void {
                foreach ($alerts as $alert) {
                    $message = $this->evaluate($alert, $today);
                    if ($message !== null) {
                        $messages[] = $message;
                    }
                }
            });

        return $messages === [] ? 0 : $this->push->send($messages);
    }

    /**
     * @return array{device: Device, title: string, body: string, data: array<string, mixed>}|null
     */
    private function evaluate(PriceAlert $alert, CarbonImmutable $today): ?array
    {
        $points = $this->board->history($alert->product_id, $alert->region_id, $today->subDays(self::LOOKBACK_DAYS), $today);
        if ($points === []) {
            return null;
        }

        $latest = $points[array_key_last($points)];
        $previous = $points[count($points) - 2] ?? null;
        $shouldNotify = false;

        if ($alert->condition === AlertCondition::Change) {
            $shouldNotify = $previous !== null
                && $latest['avg'] !== $previous['avg']
                && $alert->last_notified_date !== $latest['date'];
        } else {
            $isMet = $alert->condition === AlertCondition::Above
                ? $latest['avg'] >= $alert->threshold
                : $latest['avg'] <= $alert->threshold;
            $shouldNotify = $isMet && ! $alert->is_triggered;
            $alert->is_triggered = $isMet;
        }

        if ($shouldNotify) {
            $alert->last_notified_date = $latest['date'];
            $alert->last_notified_at = now();
        }
        $alert->save();

        if (! $shouldNotify) {
            return null;
        }

        $where = $alert->region?->name ?? 'trung bình các vùng';
        $price = $this->money($latest['avg']).'/'.$alert->product->unit;
        $change = $previous === null ? '' : $this->changeText($latest['avg'] - $previous['avg']);

        return [
            'device' => $alert->device,
            'title' => "Giá {$alert->product->name}",
            'body' => trim("{$where}: {$price} {$change}"),
            'data' => ['product' => $alert->product->code, 'region' => $alert->region?->code],
        ];
    }

    private function changeText(int $change): string
    {
        return match (true) {
            $change > 0 => '(tăng '.$this->money($change).')',
            $change < 0 => '(giảm '.$this->money(-$change).')',
            default => '(không đổi)',
        };
    }

    private function money(int $amount): string
    {
        return number_format($amount, 0, ',', '.').'đ';
    }
}
