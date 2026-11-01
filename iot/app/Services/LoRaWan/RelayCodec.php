<?php

namespace App\Services\LoRaWan;

/**
 * Mã lệnh relay của các dòng mạch điều khiển LoRaWAN.
 * Dragino LT-22222-L (tài liệu: docs.dragino.com › LT-22222-L › "Control Relay Output"):
 * - Lệnh 03 aa bb: aa = RO1, bb = RO2; 01 = đóng (máy chạy), 00 = mở (máy tắt), 11 = giữ nguyên
 * - Làm xong mạch gửi lên 1 bản tin, decoder TTN / ChirpStack trả RO1_status / RO2_status = "ON" / "OFF"
 * - Mặc định Class C: nhận lệnh gần như ngay khi đang cắm điện
 * Không dùng lệnh hẹn giờ 05 (tài liệu chưa rõ byte điều khiển); máy chủ tự gửi lệnh tắt khi hết giờ.
 */
final class RelayCodec
{
    /** @var array<string, array{name: string, channels: int}> */
    public const PROFILES = [
        'dragino-lt22222' => ['name' => 'Dragino LT-22222-L (2 relay)', 'channels' => 2],
    ];

    public static function supports(?string $profile): bool
    {
        return isset(self::PROFILES[$profile]);
    }

    /**
     * Bytes lệnh bật / tắt 1 kênh; null nếu dòng mạch / kênh không hỗ trợ.
     */
    public static function encode(?string $profile, int $channel, bool $on): ?string
    {
        if (! self::supports($profile) || $channel < 1 || $channel > self::PROFILES[$profile]['channels']) {
            return null;
        }
        $relays = [0x11, 0x11];
        $relays[$channel - 1] = $on ? 0x01 : 0x00;

        return pack('C*', 0x03, ...$relays);
    }

    /**
     * Trạng thái relay trong bản tin đã giải mã.
     *
     * @param  array<string, mixed>  $fields
     * @return array<int, bool> kênh => đang bật
     */
    public static function states(?string $profile, array $fields): array
    {
        if (! self::supports($profile)) {
            return [];
        }
        $states = [];
        for ($channel = 1; $channel <= self::PROFILES[$profile]['channels']; $channel++) {
            $value = $fields["RO{$channel}_status"] ?? null;
            if (is_string($value) && in_array(strtoupper($value), ['ON', 'OFF'], true)) {
                $states[$channel] = strtoupper($value) === 'ON';
            }
        }

        return $states;
    }
}
