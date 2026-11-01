<?php

namespace App\Services\Rain;

use App\Models\Device;
use App\Models\Farm;
use App\Notifications\ExpoPushClient;
use Carbon\CarbonImmutable;

/**
 * Theo dõi "đang mưa / đã tạnh" của từng trang trại và báo chủ vườn khi mưa bắt đầu.
 * Nguồn: dữ liệu thời tiết tại vị trí (15 phút / lần) hoặc máy đo mưa của trang trại (chính xác hơn).
 * Mỗi cơn mưa báo 1 lần; 2 lần báo cách nhau ít nhất alert_cooldown_hours (mưa rả rích, tạnh rồi mưa lại không báo dồn).
 */
class RainAlerter
{
    public function __construct(private readonly ExpoPushClient $push) {}

    /**
     * @param  float  $mm  lượng mưa của khoảng đo (dữ liệu thời tiết: 15 phút; máy đo: 1 lần đo)
     */
    public function observe(Farm $farm, float $mm, CarbonImmutable $at, ?Device $gauge = null): void
    {
        $config = config('iot.rain');

        if ($mm >= $config['min_mm_15min']) {
            $started = $farm->raining_since === null;
            if ($started) {
                $farm->raining_since = $at;
                $farm->rain_episode_mm = 0;
            }
            $farm->last_rain_at = $at;
            // Cộng dồn theo dữ liệu thời tiết (máy đo có số liệu riêng, cộng cả 2 sẽ thành gấp đôi)
            if ($gauge === null) {
                $farm->rain_episode_mm = round($farm->rain_episode_mm + $mm, 1);
            }

            $cooledDown = $farm->rain_alerted_at === null || $farm->rain_alerted_at->lt($at->subHours($config['alert_cooldown_hours']));
            if ($started && $farm->rain_alerts && $cooledDown) {
                $this->notify($farm, $mm, $at, $gauge);
                $farm->rain_alerted_at = $at;
            }
        } elseif ($farm->raining_since !== null && $farm->last_rain_at?->lt($at->subMinutes($config['dry_minutes']))) {
            // Tạnh đủ lâu: hết cơn mưa
            $farm->raining_since = null;
            $farm->rain_episode_mm = 0;
        }

        $farm->save();
    }

    private function notify(Farm $farm, float $mm, CarbonImmutable $at, ?Device $gauge): void
    {
        $tokens = $farm->recipientTokens();
        if ($tokens->isEmpty()) {
            return;
        }

        $number = fn (float $v) => number_format($v, $v < 10 ? 1 : 0, ',', '.');
        if ($gauge !== null) {
            $place = $gauge->plot ? "{$gauge->plot->name} ({$farm->name})" : $farm->name;
            $body = "Máy đo mưa \"{$gauge->name}\" ghi nhận {$number($mm)} mm lúc {$at->format('H:i')}.";
        } else {
            $place = $farm->name;
            $body = "Khoảng {$number($mm * 4)} mm/giờ theo dữ liệu thời tiết tại vị trí vườn (ước tính, có thể lệch với mưa thực tế).";
        }

        $this->push->send($tokens, "🌧️ {$place} đang mưa", $body, ['iotFarmId' => $farm->id]);
    }
}
