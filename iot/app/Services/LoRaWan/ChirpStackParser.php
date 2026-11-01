<?php

namespace App\Services\LoRaWan;

/**
 * ChirpStack v4, HTTP integration (POST ...?event=up). Dạng JSON:
 * {"time": "...", "deviceInfo": {"devEui": "a84041..."}, "object": {...dữ liệu đã giải mã...}}
 */
final class ChirpStackParser
{
    /**
     * @param  array<string, mixed>  $body
     */
    public static function parse(array $body): ?Uplink
    {
        $devEui = data_get($body, 'deviceInfo.devEui');
        $fields = data_get($body, 'object');
        if (! is_string($devEui) || ! is_array($fields)) {
            return null;
        }

        $time = data_get($body, 'time');

        return new Uplink(strtolower($devEui), is_string($time) ? $time : null, $fields);
    }
}
