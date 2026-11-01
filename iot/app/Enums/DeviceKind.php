<?php

namespace App\Enums;

use Filament\Support\Contracts\HasLabel;

enum DeviceKind: string implements HasLabel
{
    // Mạch ESP32 tự làm, gửi qua WiFi/4G (HTTP hoặc MQTT), có thể gửi bù qua điện thoại
    case Esp32 = 'esp32';
    // Cảm biến LoRaWAN thương mại (Dragino, Milesight, SenseCAP...), dữ liệu về qua webhook
    case LoRaWan = 'lorawan';

    public function getLabel(): string
    {
        return match ($this) {
            self::Esp32 => 'ESP32 (WiFi/4G)',
            self::LoRaWan => 'LoRaWAN',
        };
    }
}
