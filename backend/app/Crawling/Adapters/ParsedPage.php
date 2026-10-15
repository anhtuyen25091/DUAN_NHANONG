<?php

namespace App\Crawling\Adapters;

use App\Enums\NameKind;
use Carbon\CarbonImmutable;

final readonly class ParsedPage
{
    /**
     * @param  list<PriceRow>  $rows
     * @param  list<array{kind: NameKind, name: string}>  $unmatched
     * @param  CarbonImmutable|null  $publishedOn  ngày đăng bài (null nếu trang không ghi)
     */
    public function __construct(
        public array $rows,
        public array $unmatched = [],
        public ?CarbonImmutable $publishedOn = null,
    ) {}
}
