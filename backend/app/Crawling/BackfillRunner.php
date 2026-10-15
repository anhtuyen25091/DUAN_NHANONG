<?php

namespace App\Crawling;

use App\Crawling\Adapters\PriceSourceAdapter;
use App\Enums\CrawlStatus;
use App\Models\PriceSource;
use Carbon\CarbonImmutable;
use Illuminate\Http\Client\RequestException;
use InvalidArgumentException;
use Throwable;

/**
 * Lấy dữ liệu giá cũ theo từng tháng từ sitemap tháng của báo (vd baoquocte.vn có sitemap-month-YYYY-MM.xml).
 * Mỗi bài lấy ngày giá theo ngày đăng ghi trong bài (meta article:published_time).
 * Bài đã lấy thành công (có trong crawl_logs) thì bỏ qua, nên chạy lại / chạy tiếp sau khi ngắt được.
 *
 * Cấu hình price_sources.config.backfill:
 * - sitemaps: danh sách mẫu URL sitemap tháng, thử lần lượt; {Y} năm, {m} tháng có số 0 (03), {n} tháng không có số 0 (3)
 * - url_pattern: regex lọc URL bài giá trong sitemap
 */
class BackfillRunner
{
    public function __construct(
        private Fetcher $fetcher,
        private PriceImporter $importer,
    ) {}

    /**
     * @param  callable(string, string): void|null  $progress  (url, kết quả) sau mỗi bài
     * @return array{articles: int, done_before: int, imported: int, failed: int}
     */
    public function runMonth(PriceSource $source, CarbonImmutable $month, ?callable $progress = null, bool $keepHtml = false): array
    {
        $adapter = $this->adapterFor($source);
        $urls = $this->discover($source, $month);
        $stats = ['articles' => count($urls), 'done_before' => 0, 'imported' => 0, 'failed' => 0];

        $done = $source->crawlLogs()
            ->whereIn('url', $urls)
            ->whereIn('status', [CrawlStatus::Success, CrawlStatus::Empty])
            ->pluck('url')
            ->flip();

        foreach ($urls as $url) {
            if (isset($done[$url])) {
                $stats['done_before']++;

                continue;
            }

            $html = null;
            try {
                $html = $this->fetcher->get($url);
                $page = $adapter->parse($source, $html);
                if ($page->publishedOn === null) {
                    throw new CrawlBlockedException('Không đọc được ngày đăng bài.');
                }

                $counts = $this->importer->import($source, $page->publishedOn, $url, $page);
                $status = $counts['imported'] > 0 ? CrawlStatus::Success : CrawlStatus::Empty;
                $message = "Dữ liệu cũ: lưu {$counts['imported']} giá ngày {$page->publishedOn->format('d/m/Y')}, bỏ {$counts['skipped']}.";
                $this->log($source, $page->publishedOn, $url, $status, $message, $counts['imported'], $keepHtml ? $html : null);
                $stats['imported'] += $counts['imported'];
                $progress && $progress($url, $message);
            } catch (Throwable $e) {
                if (! $e instanceof CrawlBlockedException) {
                    report($e);
                }
                $this->log($source, $month, $url, CrawlStatus::Failed, 'Dữ liệu cũ: '.$e->getMessage(), 0, $html);
                $stats['failed']++;
                $progress && $progress($url, 'Lỗi: '.$e->getMessage());
            }
        }

        return $stats;
    }

    /**
     * @return list<string>
     */
    public function discover(PriceSource $source, CarbonImmutable $month): array
    {
        $config = $source->configValue('backfill');
        if (! is_array($config) || empty($config['sitemaps']) || empty($config['url_pattern'])) {
            throw new InvalidArgumentException("Nguồn {$source->code} chưa cấu hình backfill.");
        }

        foreach ($config['sitemaps'] as $template) {
            $url = strtr($template, ['{Y}' => $month->format('Y'), '{m}' => $month->format('m'), '{n}' => $month->format('n')]);
            try {
                $xml = $this->fetcher->get($url);
            } catch (RequestException) {
                continue; // Mẫu URL này không có cho tháng này (404), thử mẫu tiếp theo
            }

            preg_match_all('#<loc>\s*(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?\s*</loc>#s', $xml, $matches);
            $urls = array_values(array_unique(array_filter(
                array_map(fn (string $loc): string => html_entity_decode(trim($loc)), $matches[1]),
                fn (string $loc): bool => (bool) preg_match($config['url_pattern'], $loc),
            )));

            if ($urls !== []) {
                return $urls;
            }
        }

        return [];
    }

    private function adapterFor(PriceSource $source): PriceSourceAdapter
    {
        $class = config('crawler.adapters.'.$source->adapter);
        if ($class === null) {
            throw new InvalidArgumentException("Adapter không tồn tại: {$source->adapter}");
        }

        return app($class);
    }

    private function log(PriceSource $source, CarbonImmutable $date, string $url, CrawlStatus $status, string $message, int $items, ?string $html): void
    {
        $source->crawlLogs()->create([
            'target_date' => $date->toDateString(),
            'url' => $url,
            'status' => $status,
            'items_count' => $items,
            'message' => $message,
            'raw_html' => $html,
        ]);
    }
}
