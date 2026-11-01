<?php

namespace App\Notifications;

use App\Models\Farm;

/**
 * Nhắc "đã N ngày không mưa" (mùa khô), kèm dự báo vài ngày tới nếu có.
 */
class DryNotifier
{
    public function __construct(private readonly ExpoPushClient $client) {}

    public function send(Farm $farm, int $days, float $totalMm, ?string $forecast): int
    {
        $tokens = $farm->recipientTokens();
        if ($tokens->isEmpty()) {
            return 0;
        }

        $body = "Tổng mưa {$days} ngày qua ".number_format($totalMm, 1, ',', '.').' mm.'.($forecast ? " {$forecast}" : '').' Kiểm tra độ ẩm đất, cân nhắc tưới.';

        return $this->client->send($tokens, "☀️ {$farm->name} đã {$days} ngày không mưa", $body, ['iotFarmId' => $farm->id, 'iotFarmName' => $farm->name]);
    }
}
