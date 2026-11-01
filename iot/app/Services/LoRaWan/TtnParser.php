<?php

namespace App\Services\LoRaWan;

/**
 * The Things Stack (TTN v3), webhook "Uplink message". Dạng JSON:
 * {"end_device_ids": {"dev_eui": "..."}, "uplink_message": {"decoded_payload": {...}, "received_at": "..."}}
 */
final class TtnParser
{
    /**
     * @param  array<string, mixed>  $body
     */
    public static function parse(array $body): ?Uplink
    {
        $devEui = data_get($body, 'end_device_ids.dev_eui');
        $fields = data_get($body, 'uplink_message.decoded_payload');
        if (! is_string($devEui) || ! is_array($fields)) {
            return null;
        }

        $time = data_get($body, 'uplink_message.received_at') ?? data_get($body, 'received_at');

        return new Uplink(strtolower($devEui), is_string($time) ? $time : null, $fields);
    }
}
