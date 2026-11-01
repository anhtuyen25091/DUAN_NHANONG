<?php

namespace App\Console\Commands;

use App\Enums\ReadingSource;
use App\Models\Device;
use App\Services\ReadingIngestor;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use PhpMqtt\Client\ConnectionSettings;
use PhpMqtt\Client\MqttClient;
use Throwable;

/**
 * Nhận số đo qua MQTT. Thiết bị publish lên topic nhanong/{uid}/up, nội dung giống POST /ingest kèm khóa:
 * {"key": "ndk_...", "firmware": "1.0.0", "readings": [{"metric": "soil_ph", "value": 6.4, "t": 1730170000}]}
 *
 * Chạy liên tục bằng supervisor (giống queue:work).
 */
#[Signature('iot:mqtt-listen')]
#[Description('Nghe MQTT và lưu số đo thiết bị gửi lên')]
class MqttListen extends Command
{
    public function handle(ReadingIngestor $ingestor): int
    {
        $config = config('iot.mqtt');
        // Mã client cố định + phiên bền (không clean session): lệnh này dừng / khởi động lại (deploy)
        // thì broker giữ các bản tin QoS 1 trong lúc đó và giao bù, không mất số đo. Chỉ chạy 1 tiến trình.
        $client = new MqttClient($config['host'], $config['port'], $config['client_id'], MqttClient::MQTT_3_1_1);

        $settings = (new ConnectionSettings)
            ->setUsername($config['username'] ?: null)
            ->setPassword($config['password'] ?: null)
            ->setKeepAliveInterval(60)
            ->setReconnectAutomatically(true)
            ->setMaxReconnectAttempts(PHP_INT_MAX);

        $client->connect($settings, false);
        $this->info("Đang nghe {$config['topic']} tại {$config['host']}:{$config['port']}");

        $client->subscribe($config['topic'], function (string $topic, string $message) use ($ingestor) {
            try {
                $this->handleMessage($ingestor, $topic, $message);
            } catch (Throwable $e) {
                Log::warning('MQTT: lỗi xử lý bản tin', ['topic' => $topic, 'error' => $e->getMessage()]);
            }
        }, MqttClient::QOS_AT_LEAST_ONCE);

        if (function_exists('pcntl_signal')) {
            pcntl_async_signals(true);
            pcntl_signal(SIGTERM, fn () => $client->interrupt());
            pcntl_signal(SIGINT, fn () => $client->interrupt());
        }

        $client->loop(true);
        $client->disconnect();

        return self::SUCCESS;
    }

    private function handleMessage(ReadingIngestor $ingestor, string $topic, string $message): void
    {
        $uid = explode('/', $topic)[1] ?? '';
        $payload = json_decode($message, true);
        $device = Device::query()->where('uid', $uid)->first();

        if (! is_array($payload) || $device === null || $device->api_key_hash === null
            || ! hash_equals($device->api_key_hash, hash('sha256', (string) ($payload['key'] ?? '')))) {
            Log::notice('MQTT: bỏ qua bản tin không hợp lệ', ['topic' => $topic]);

            return;
        }

        $result = $ingestor->ingestPayload($device, $payload, ReadingSource::Mqtt);
        $this->line(sprintf('%s: nhận %d, trùng %d, loại %d', $uid, $result->accepted, $result->duplicates, count($result->rejected)));
    }
}
