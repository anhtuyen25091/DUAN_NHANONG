<?php

namespace App\Crawling\Adapters;

final readonly class PriceRow
{
    public function __construct(
        public int $productId,
        public int $regionId,
        public int $min,
        public int $max,
        public int $avg,
        public ?string $unit,
    ) {}
}
