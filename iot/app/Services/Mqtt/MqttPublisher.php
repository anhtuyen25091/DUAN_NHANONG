<?php

namespace App\Services\Mqtt;

use Illuminate\Support\Str;
use PhpMqtt\Client\ConnectionSettings;
use PhpMqtt\Client\Exceptions\MqttClientException;
use PhpMqtt\Client\MqttClient;
use PhpMqtt\Client\Repositories\MemoryRepository;
use RuntimeException;

/**
 * Gửi 1 bản tin lên broker rồi ngắt (dùng trong queue job). QoS 1: chờ broker xác nhận PUBACK mới coi là đã gửi.
 * Test thay bằng bản giả (container), không cần broker thật.
 */
class MqttPublisher
{
    /**
     * @throws RuntimeException broker không kết nối được / không xác nhận
     */
    public function publish(string $topic, string $message, int $qos = MqttClient::QOS_AT_LEAST_ONCE, bool $retain = false): void
    {
        $config = config('iot.mqtt');
        $timeout = max(1, (int) $config['timeout_seconds']);

        try {
            // Phiên sạch, mã client riêng mỗi lần: không đụng phiên bền của iot:mqtt-listen
            $repository = new MemoryRepository;
            $client = new MqttClient($config['host'], $config['port'], $config['publisher_client_id'].'-'.Str::lower(Str::random(8)), MqttClient::MQTT_3_1_1, $repository);
            $client->connect((new ConnectionSettings)
                ->setUsername($config['username'] ?: null)
                ->setPassword($config['password'] ?: null)
                ->setConnectTimeout($timeout)
                ->setSocketTimeout($timeout), true);
            $client->publish($topic, $message, $qos, $retain);
            // Chờ broker xác nhận (QoS 1), tối đa $timeout giây
            $client->loop(true, true, $timeout);
            $unconfirmed = $repository->countPendingOutgoingMessages();
            $client->disconnect();
            if ($unconfirmed > 0) {
                throw new RuntimeException('Broker MQTT không xác nhận bản tin');
            }
        } catch (MqttClientException $e) {
            throw new RuntimeException('Không gửi được qua MQTT: '.$e->getMessage(), previous: $e);
        }
    }
}
