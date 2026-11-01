<?php

namespace App\Services;

/**
 * Kết quả 1 lần nhận số đo. Thiết bị chỉ cần xóa hàng đợi khi nhận được phản hồi này
 * (số đo trùng hay bị loại cũng không cần gửi lại).
 */
final readonly class IngestResult
{
    /**
     * @param  list<array{index: int, reason: string}>  $rejected
     */
    public function __construct(
        public int $accepted,
        public int $duplicates,
        public array $rejected,
    ) {}

    /**
     * @return array{accepted: int, duplicates: int, rejected: list<array{index: int, reason: string}>, server_time: int}
     */
    public function toArray(): array
    {
        return [
            'accepted' => $this->accepted,
            'duplicates' => $this->duplicates,
            'rejected' => $this->rejected,
            'server_time' => now()->getTimestamp(),
        ];
    }
}
