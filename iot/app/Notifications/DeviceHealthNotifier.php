<?php

namespace App\Notifications;

use App\Models\Device;

/**
 * Báo chủ trang trại khi thiết bị không gửi số đo quá lâu (mất sóng, hết pin, hỏng) hoặc pin sắp hết.
 */
class DeviceHealthNotifier
{
    public function __construct(private ExpoPushClient $client) {}

    public function offline(Device $device): int
    {
        $where = $device->plot ? " ({$device->plot->name})" : '';
        $hint = $device->kind->value === 'esp32'
            ? 'Kiểm tra nguồn, sóng WiFi / 4G; ruộng không có mạng thì ra lấy dữ liệu bằng điện thoại.'
            : 'Kiểm tra pin thiết bị và gateway LoRaWAN.';

        return $this->send(
            $device,
            "{$device->name}{$where} mất kết nối",
            "Không nhận được số đo từ {$device->last_seen_at->format('H:i d/m')}. {$hint}",
        );
    }

    public function lowBattery(Device $device): int
    {
        $where = $device->plot ? " ({$device->plot->name})" : '';

        return $this->send($device, "{$device->name}{$where} sắp hết pin", "Pin còn {$device->battery}%. Thay hoặc sạc pin để thiết bị không ngừng đo.");
    }

    private function send(Device $device, string $title, string $body): int
    {
        $tokens = $device->farm->recipientTokens();

        return $tokens->isEmpty() ? 0 : $this->client->send($tokens, $title, $body, array_filter([
            'iotPlotId' => $device->plot_id,
            'iotDeviceId' => $device->id,
        ]));
    }
}
