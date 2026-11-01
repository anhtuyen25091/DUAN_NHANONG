<?php

namespace App\Enums;

use Filament\Support\Contracts\HasLabel;

enum ReadingSource: string implements HasLabel
{
    case Http = 'http';
    case Mqtt = 'mqtt';
    case LoRaWan = 'lorawan';
    // File dữ liệu điện thoại tải từ thiết bị (khi ở ruộng không có mạng) rồi gửi lên sau
    case PhoneRelay = 'phone_relay';
    case Sms = 'sms';
    case Simulator = 'simulator';

    public function getLabel(): string
    {
        return match ($this) {
            self::Http => 'HTTP',
            self::Mqtt => 'MQTT',
            self::LoRaWan => 'LoRaWAN',
            self::PhoneRelay => 'Điện thoại chuyển tiếp',
            self::Sms => 'SMS',
            self::Simulator => 'Giả lập',
        };
    }
}
