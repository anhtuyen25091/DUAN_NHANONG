<?php

namespace App\Jobs;

use App\Crawling\CrawlRunner;
use App\Models\PriceSource;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Chạy 1 nguồn giá cho 1 ngày. Lỗi tải/trích đã được CrawlRunner ghi vào crawl_logs,
 * nên job chỉ thử lại khi lỗi bất ngờ (vd mất kết nối DB).
 */
class RunPriceSource implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    /** @var list<int> */
    public array $backoff = [300, 900];

    public int $timeout = 600;

    public function __construct(
        public PriceSource $source,
        public string $date,
    ) {}

    public function uniqueId(): string
    {
        return $this->source->id.':'.$this->date;
    }

    public function handle(CrawlRunner $runner): void
    {
        $runner->run($this->source, CarbonImmutable::parse($this->date));
    }
}
