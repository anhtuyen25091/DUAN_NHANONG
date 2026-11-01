<?php

namespace App\Console\Commands;

use App\Enums\DeviceKind;
use App\Enums\PlotType;
use App\Enums\ReadingSource;
use App\Models\Device;
use App\Services\ReadingIngestor;
use Carbon\CarbonImmutable;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Contracts\Http\Kernel;
use Illuminate\Http\Request;

/**
 * Giả lập cảm biến khi chưa có phần cứng: sinh số đo dao động theo ngày-đêm cho N giờ qua.
 * --offline=6: 6 giờ cuối "mất mạng", số đo dồn lại rồi gửi bù 1 lô khi "có mạng lại" (như firmware ESP32).
 * --lorawan: gửi qua webhook ChirpStack như thiết bị LoRaWAN thật.
 */
#[Signature('iot:simulate
    {device : Mã thiết bị (uid, VD ND7K3M9QXA)}
    {--hours=24 : Giả lập bao nhiêu giờ qua}
    {--interval=15 : Số phút giữa 2 lần đo}
    {--offline=0 : Số giờ cuối không có mạng (gửi bù 1 lô ở cuối)}
    {--metrics= : Danh sách chỉ số, cách nhau dấu phẩy (mặc định theo loại lô)}
    {--lorawan : Gửi qua webhook ChirpStack thay vì gọi thẳng}')]
#[Description('Giả lập thiết bị gửi số đo (có thể giả lập mất mạng rồi gửi bù)')]
class SimulateDevice extends Command
{
    /** Giá trị nền, biên độ dao động ngày-đêm, nhiễu */
    private const PROFILES = [
        'soil_moisture' => [42, 6, 1.5],
        'soil_temp' => [27, 3, 0.3],
        'soil_ec' => [850, 60, 20],
        'soil_ph' => [6.2, 0.1, 0.05],
        'soil_n' => [120, 5, 3],
        'soil_p' => [45, 2, 2],
        'soil_k' => [160, 6, 4],
        'water_level' => [5, 1.5, 0.3],
        'water_ph' => [7.9, 0.3, 0.05],
        'water_temp' => [29, 2.5, 0.2],
        'water_do' => [5.5, 1.8, 0.2],
        'water_orp' => [180, 20, 5],
        'salinity' => [3.2, 0.6, 0.1],
        'air_temp' => [30, 5, 0.4],
        'air_humidity' => [75, 15, 2],
        'battery' => [87, 0, 0.4],
    ];

    public function handle(ReadingIngestor $ingestor): int
    {
        $device = Device::query()->with('plot')->where('uid', $this->argument('device'))->first();
        if ($device === null) {
            $this->error('Không tìm thấy thiết bị. Xem mã (uid) trong /admin > Thiết bị.');

            return self::FAILURE;
        }

        $codes = $this->option('metrics')
            ? array_map('trim', explode(',', $this->option('metrics')))
            : $this->defaultMetrics($device->plot?->type);
        $unknown = array_diff($codes, array_keys(self::PROFILES));
        if ($unknown !== []) {
            $this->error('Chỉ số không hỗ trợ giả lập: '.implode(', ', $unknown));

            return self::FAILURE;
        }

        $lorawan = (bool) $this->option('lorawan');
        if ($lorawan && $device->kind !== DeviceKind::LoRaWan) {
            $this->error('Thiết bị này không phải LoRaWAN.');

            return self::FAILURE;
        }

        $now = CarbonImmutable::now()->startOfMinute();
        $interval = max(1, (int) $this->option('interval'));
        $offlineFrom = $now->subHours((int) $this->option('offline'));
        $backlog = [];
        $sent = 0;

        for ($t = $now->subHours((int) $this->option('hours')); $t->lte($now); $t = $t->addMinutes($interval)) {
            $rows = array_map(fn (string $code) => ['metric' => $code, 'value' => $this->value($code, $t), 't' => $t->getTimestamp()], $codes);

            if ((int) $this->option('offline') > 0 && $t->gt($offlineFrom)) {
                array_push($backlog, ...$rows);

                continue;
            }

            $sent += $lorawan ? $this->sendLoRaWan($device, $rows, $t) : $ingestor->ingest($device, $rows, ReadingSource::Simulator)->accepted;
        }
        $this->info("Đã gửi {$sent} số đo trực tiếp.");

        if ($backlog !== []) {
            $this->warn('Mất mạng '.$this->option('offline').' giờ, thiết bị lưu '.count($backlog).' số đo vào bộ nhớ.');
            $result = $ingestor->ingest($device, $backlog, ReadingSource::Simulator);
            $this->info("Có mạng lại: gửi bù 1 lô, nhận {$result->accepted}, trùng {$result->duplicates}, loại ".count($result->rejected).'.');
        }

        return self::SUCCESS;
    }

    /**
     * @return list<string>
     */
    private function defaultMetrics(?PlotType $type): array
    {
        return match ($type) {
            PlotType::Pond => ['water_ph', 'water_temp', 'water_do', 'salinity', 'water_level', 'battery'],
            PlotType::Field => ['water_level', 'salinity', 'soil_moisture', 'soil_temp', 'soil_ph', 'battery'],
            default => ['soil_moisture', 'soil_temp', 'soil_ec', 'soil_ph', 'soil_n', 'soil_p', 'soil_k', 'battery'],
        };
    }

    private function value(string $code, CarbonImmutable $t): float
    {
        [$base, $amplitude, $noise] = self::PROFILES[$code];
        // Đỉnh lúc 14h, đáy lúc 2h
        $hour = $t->hour + $t->minute / 60;
        $diurnal = sin(($hour - 8) / 24 * 2 * M_PI);

        return round($base + $amplitude * $diurnal + $noise * (mt_rand() / mt_getrandmax() * 2 - 1), 3);
    }

    /**
     * Đi qua đúng webhook ChirpStack (profile generic: tên trường = mã chỉ số).
     *
     * @param  list<array{metric: string, value: float, t: int}>  $rows
     */
    private function sendLoRaWan(Device $device, array $rows, CarbonImmutable $t): int
    {
        if ((string) config('iot.lorawan_secret') === '') {
            config(['iot.lorawan_secret' => 'simulator']);
        }

        $request = Request::create('/api/v1/lorawan/chirpstack?event=up', 'POST', server: [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_X_WEBHOOK_SECRET' => config('iot.lorawan_secret'),
        ], content: json_encode([
            'time' => $t->toIso8601String(),
            'deviceInfo' => ['devEui' => $device->dev_eui],
            'object' => array_column($rows, 'value', 'metric'),
        ]));

        $response = app(Kernel::class)->handle($request);

        return (int) (json_decode((string) $response->getContent(), true)['accepted'] ?? 0);
    }
}
