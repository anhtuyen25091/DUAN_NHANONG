<?php

namespace App\Console\Commands;

use App\Services\Mqtt\MqttInbox;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use PhpMqtt\Client\ConnectionSettings;
use PhpMqtt\Client\MqttClient;
use Throwable;

/**
 * Nghe MQTT: số đo (nhanong/{uid}/up, nội dung giống POST /ingest kèm khóa) và kết quả lệnh của mạch điều khiển
 * (nhanong/{uid}/ack). Xử lý từng bản tin ở App\Services\Mqtt\MqttInbox.
 * Lệnh đẩy xuống (nhanong/{uid}/down) do queue job SendMqttDownlink gửi, không qua tiến trình này.
 *
 * Chạy liên tục bằng supervisor (giống queue:work).
 */
#[Signature('iot:mqtt-listen')]
#[Description('Nghe MQTT: lưu số đo và kết quả lệnh thiết bị gửi lên')]
class MqttListen extends Command
{
    public function handle(MqttInbox $inbox): int
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
        $this->info("Đang nghe {$config['topic']}, {$config['ack_topic']} tại {$config['host']}:{$config['port']}");

        foreach ([$config['topic'], $config['ack_topic']] as $topic) {
            $client->subscribe($topic, function (string $topic, string $message) use ($inbox) {
                try {
                    if (($line = $inbox->handle($topic, $message)) !== null) {
                        $this->line($line);
                    }
                } catch (Throwable $e) {
                    Log::warning('MQTT: lỗi xử lý bản tin', ['topic' => $topic, 'error' => $e->getMessage()]);
                }
            }, MqttClient::QOS_AT_LEAST_ONCE);
        }

        if (function_exists('pcntl_signal')) {
            pcntl_async_signals(true);
            pcntl_signal(SIGTERM, fn () => $client->interrupt());
            pcntl_signal(SIGINT, fn () => $client->interrupt());
        }

        $client->loop(true);
        $client->disconnect();

        return self::SUCCESS;
    }
}
