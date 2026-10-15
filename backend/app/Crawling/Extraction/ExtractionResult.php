<?php

namespace App\Crawling\Extraction;

final readonly class ExtractionResult
{
    /**
     * @param  array<int, ExtractedPrice>  $prices  theo id thực thể
     * @param  list<string>  $unmatchedNames  tên ở cột đầu bảng giá không khớp alias nào
     */
    public function __construct(
        public array $prices,
        public array $unmatchedNames,
    ) {}
}
