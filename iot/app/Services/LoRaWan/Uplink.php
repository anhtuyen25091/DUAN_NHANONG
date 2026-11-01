<?php

namespace App\Services\LoRaWan;

/**
 * Bản tin uplink đã chuẩn hóa từ network server (ChirpStack / The Things Stack).
 * Giải mã payload nhị phân do decoder trên network server làm; ở đây chỉ đọc kết quả đã giải mã.
 */
final readonly class Uplink
{
    /**
     * @param  array<string, mixed>  $fields  dữ liệu đã giải mã (object / decoded_payload)
     */
    public function __construct(
        public string $devEui,
        public ?string $time,
        public array $fields,
    ) {}
}
