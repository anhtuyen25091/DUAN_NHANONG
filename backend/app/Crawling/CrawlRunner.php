<?php

namespace App\Crawling;

use App\Crawling\Adapters\ParsedPage;
use App\Crawling\Adapters\PriceSourceAdapter;
use App\Enums\CrawlStatus;
use App\Models\CrawlLog;
use App\Models\PriceSource;
use Carbon\CarbonImmutable;
use InvalidArgumentException;
use Throwable;

/**
 * Chạy một nguồn giá cho một ngày: tìm bài -> tải -> trích -> ghi DB, mỗi bài ghi 1 dòng crawl_logs.
 */
class CrawlRunner
{
    public function __construct(
        private Fetcher $fetcher,
        private PriceImporter $importer,
    ) {}

    public function run(PriceSource $source, CarbonImmutable $date): CrawlStatus
    {
        $adapter = $this->adapterFor($source);

        try {
            $urls = $adapter->discover($source, $date);
        } catch (Throwable $e) {
            report($e);

            return $this->finish($source, $this->log($source, $date, null, CrawlStatus::Failed, 'Lỗi tìm bài: '.$e->getMessage()));
        }

        if ($urls === []) {
            return $this->finish($source, $this->log($source, $date, null, CrawlStatus::Skipped, 'Không tìm thấy bài giá cho ngày này.'));
        }

        $statuses = [];
        foreach ($urls as $url) {
            $statuses[] = $this->runUrl($source, $adapter, $date, $url)->status;
        }

        return $this->finish($source, null, $this->overallStatus($statuses));
    }

    /**
     * Trích lại giá từ HTML đã lưu (dùng sau khi sửa parser hoặc thêm alias).
     */
    public function reparse(CrawlLog $log): CrawlLog
    {
        $source = $log->priceSource;
        $date = CarbonImmutable::parse($log->target_date);

        try {
            $page = $this->adapterFor($source)->parse($source, (string) $log->raw_html);
            $priceDate = $this->priceDate($source, $page, $date) ?? $date;
            $counts = $this->importer->import($source, $priceDate, (string) $log->url, $page);
            $log->update([
                'status' => $counts['imported'] > 0 ? CrawlStatus::Success : CrawlStatus::Empty,
                'items_count' => $counts['imported'],
                'message' => $this->summary($counts, $priceDate, $date).' (chạy lại)',
            ]);
        } catch (Throwable $e) {
            report($e);
            $log->update(['status' => CrawlStatus::Failed, 'message' => $e->getMessage()]);
        }

        return $log;
    }

    private function runUrl(PriceSource $source, PriceSourceAdapter $adapter, CarbonImmutable $date, string $url): CrawlLog
    {
        $html = null;

        try {
            $html = $this->fetcher->get($url);
            $page = $adapter->parse($source, $html);

            $priceDate = $this->priceDate($source, $page, $date);
            if ($priceDate === null) {
                return $this->log($source, $date, $url, CrawlStatus::Skipped, 'Bài đăng ngày '.$page->publishedOn->format('d/m/Y').', không phải ngày cần lấy.');
            }

            $counts = $this->importer->import($source, $priceDate, $url, $page);
            $status = $counts['imported'] > 0 ? CrawlStatus::Success : CrawlStatus::Empty;

            return $this->log($source, $date, $url, $status, $this->summary($counts, $priceDate, $date), $counts['imported'], $html);
        } catch (CrawlBlockedException $e) {
            return $this->log($source, $date, $url, CrawlStatus::Failed, $e->getMessage(), 0, $html);
        } catch (Throwable $e) {
            report($e);

            return $this->log($source, $date, $url, CrawlStatus::Failed, $e->getMessage(), 0, $html);
        }
    }

    private function adapterFor(PriceSource $source): PriceSourceAdapter
    {
        $class = config('crawler.adapters.'.$source->adapter);
        if ($class === null) {
            throw new InvalidArgumentException("Adapter không tồn tại: {$source->adapter}");
        }

        return app($class);
    }

    private function log(
        PriceSource $source,
        CarbonImmutable $date,
        ?string $url,
        CrawlStatus $status,
        string $message,
        int $items = 0,
        ?string $html = null,
    ): CrawlLog {
        return $source->crawlLogs()->create([
            'target_date' => $date->toDateString(),
            'url' => $url,
            'status' => $status,
            'items_count' => $items,
            'message' => $message,
            'raw_html' => $html,
        ]);
    }

    private function finish(PriceSource $source, ?CrawlLog $log, ?CrawlStatus $status = null): CrawlStatus
    {
        $status ??= $log->status;
        $source->update(['last_run_at' => now(), 'last_status' => $status]);

        return $status;
    }

    /**
     * @param  list<CrawlStatus>  $statuses
     */
    private function overallStatus(array $statuses): CrawlStatus
    {
        foreach ([CrawlStatus::Success, CrawlStatus::Empty, CrawlStatus::Failed] as $candidate) {
            if (in_array($candidate, $statuses, true)) {
                return $candidate;
            }
        }

        return CrawlStatus::Skipped;
    }

    /**
     * Ngày gắn cho giá. Bài báo hằng ngày phải đăng đúng ngày cần lấy (null = bỏ qua);
     * trang bảng giá cố định (same_day_only = false) dùng ngày cập nhật ghi trên trang.
     */
    private function priceDate(PriceSource $source, ParsedPage $page, CarbonImmutable $date): ?CarbonImmutable
    {
        if ($page->publishedOn === null) {
            return $date;
        }

        if (! $source->configValue('same_day_only', true)) {
            return $page->publishedOn;
        }

        return $page->publishedOn->isSameDay($date) ? $date : null;
    }

    /**
     * @param  array{imported: int, skipped: int}  $counts
     */
    private function summary(array $counts, CarbonImmutable $priceDate, CarbonImmutable $runDate): string
    {
        $summary = "Lưu {$counts['imported']} giá, bỏ {$counts['skipped']} giá sai đơn vị/đã loại.";

        return $priceDate->isSameDay($runDate) ? $summary : $summary.' Giá theo ngày cập nhật '.$priceDate->format('d/m/Y').'.';
    }
}
