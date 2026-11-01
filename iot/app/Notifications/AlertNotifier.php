<?php

namespace App\Notifications;

use App\Enums\AlertDirection;
use App\Models\Alert;

/**
 * Báo chủ trang trại khi một chỉ số vừa vượt ngưỡng (chỉ lúc mở cảnh báo, không báo lặp lại mỗi lần đo).
 */
class AlertNotifier
{
    public function __construct(private ExpoPushClient $client) {}

    public function opened(Alert $alert): int
    {
        $alert->loadMissing(['threshold.plot.farm', 'threshold.metric', 'device']);
        $threshold = $alert->threshold;
        $metric = $threshold->metric;
        $tokens = $threshold->plot->farm->recipientTokens();
        if ($tokens->isEmpty()) {
            return 0;
        }

        $number = fn (float $value): string => number_format($value, $metric->decimals, ',', '.');
        $unit = $metric->unit ? ' '.$metric->unit : '';
        [$word, $limit] = $alert->direction === AlertDirection::Below
            ? ['thấp', '≥ '.$number($threshold->min)]
            : ['cao', '≤ '.$number($threshold->max)];

        return $this->client->send(
            $tokens,
            "{$threshold->plot->name}: {$metric->name} {$word}",
            "{$number($alert->value)}{$unit} (ngưỡng {$limit}{$unit}). Đo lúc {$alert->measured_at->format('H:i d/m')} bởi {$alert->device->name}.",
            ['iotAlertId' => $alert->id, 'iotPlotId' => $threshold->plot_id],
        );
    }
}
