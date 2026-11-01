<?php

namespace App\Services\LoRaWan;

use App\Models\Device;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Đẩy bản tin xuống thiết bị LoRaWAN qua network server.
 * - The Things Stack: địa chỉ + khóa lưu ở devices.downlink (lấy từ header bản tin gửi lên)
 * - ChirpStack v4: POST {CHIRPSTACK_API_URL}/api/devices/{devEui}/queue
 */
class DownlinkSender
{
    /**
     * @throws RuntimeException chưa cấu hình được đường gửi, hoặc network server từ chối
     */
    public function send(Device $device, string $bytes): void
    {
        $fport = config('iot.lorawan.downlink_fport');
        $payload = base64_encode($bytes);

        if (! empty($device->downlink['push_url']) && ! empty($device->downlink['api_key'])) {
            $response = Http::withToken($device->downlink['api_key'])->acceptJson()->timeout(10)
                ->post($device->downlink['push_url'], ['downlinks' => [['frm_payload' => $payload, 'f_port' => $fport, 'priority' => 'HIGH']]]);
        } elseif (config('iot.lorawan.chirpstack_url') && config('iot.lorawan.chirpstack_token')) {
            $response = Http::withHeaders(['Grpc-Metadata-Authorization' => 'Bearer '.config('iot.lorawan.chirpstack_token')])->acceptJson()->timeout(10)
                ->post(rtrim(config('iot.lorawan.chirpstack_url'), '/').'/api/devices/'.$device->dev_eui.'/queue', [
                    'queueItem' => ['confirmed' => false, 'fPort' => $fport, 'data' => $payload],
                ]);
        } else {
            throw new RuntimeException('Chưa nối được đường gửi lệnh LoRaWAN: bật "Downlink API key" trong webhook The Things Stack, hoặc khai báo CHIRPSTACK_API_URL / CHIRPSTACK_API_TOKEN.');
        }

        if ($response->failed()) {
            throw new RuntimeException('Network server từ chối lệnh (HTTP '.$response->status().').');
        }
    }
}
