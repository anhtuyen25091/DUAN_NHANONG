<?php

namespace App\Crawling\Adapters;

use App\Models\PriceSource;
use Carbon\CarbonImmutable;

interface PriceSourceAdapter
{
    /**
     * Tìm các URL bài/trang giá của ngày cần lấy.
     *
     * @return list<string>
     */
    public function discover(PriceSource $source, CarbonImmutable $date): array;

    /**
     * Trích giá từ HTML đã tải.
     */
    public function parse(PriceSource $source, string $html): ParsedPage;
}
