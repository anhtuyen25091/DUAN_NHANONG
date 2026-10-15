<?php

namespace App\Crawling\Extraction;

/**
 * Một mức giá trích được, gắn với id thực thể (mặt hàng hoặc khu vực tùy chế độ của nguồn).
 */
final readonly class ExtractedPrice
{
    public function __construct(
        public int $entityId,
        public int $min,
        public int $max,
        public int $avg,
        public ?string $unit,
    ) {}

    /**
     * @param  list<int>  $ranges  các giá trị đọc từ khoảng "A - B" (vd giá thấp nhất - cao nhất)
     * @param  list<int>  $singles  các giá trị đứng riêng (vd "giá phổ biến")
     */
    public static function fromValues(int $entityId, array $ranges, array $singles, ?string $unit): ?self
    {
        $all = [...$ranges, ...$singles];
        if ($all === []) {
            return null;
        }

        $min = min($all);
        $max = max($all);
        $avg = $singles !== [] ? $singles[0] : (int) round(($min + $max) / 2);

        return new self($entityId, $min, $max, $avg, $unit);
    }
}
