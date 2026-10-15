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
 * - sitemaps: danh sách mẫu URL sitemap tháng, thử lần lượt; {Y} năm, {m} tháng có số 0 (03), {n} tháng không có số 0 (3).
 *   Mẫu có {w} là sitemap theo tuần trong tháng (vd congthuong.vn/sitemap-article-2021-11-2.xml): đọc hết tuần 1..5 rồi gộp.
 * - list_pages: thay cho sitemaps, tìm bài qua các trang danh sách (trang tag) xếp theo thời gian:
 *   [{url: "…/trang-{page}", from: 1, to: 60}, …]; đọc lần lượt tới trang không còn bài khớp, ngày bài lấy theo
 *   thẻ <time datetime> đứng sau link trong trang danh sách (đọc 1 lần cho mọi tháng của lần chạy).
 * - url_pattern: regex lọc URL bài giá trong sitemap / trang danh sách
 * - strategy: "agro_gov" => lấy cả tháng từ CSDL giá agro.gov.vn (xem App\Crawling\AgroGovBackfill)
 */
class BackfillRunner
{
    /** @var array<string, array<string, string>> mã nguồn => [url bài => ngày Y-m-d] đọc từ trang danh sách */
    private array $listed = [];

    public function __construct(
        private Fetcher $fetcher,
        private PriceImporter $importer,
        private AgroGovBackfill $agroGov,
    ) {}

    /**
     * @param  callable(string, string): void|null  $progress  (url, kết quả) sau mỗi bài
     * @return array{articles: int, done_before: int, imported: int, failed: int}
     */
    public function runMonth(PriceSource $source, CarbonImmutable $month, ?callable $progress = null, bool $keepHtml = false): array
    {
        if (($source->configValue('backfill')['strategy'] ?? null) === 'agro_gov') {
            return $this->agroGov->runMonth($source, $month, $progress);
        }

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
        if (! is_array($config) || (empty($config['sitemaps']) && empty($config['list_pages'])) || empty($config['url_pattern'])) {
            throw new InvalidArgumentException("Nguồn {$source->code} chưa cấu hình backfill.");
        }

        if (! empty($config['list_pages'])) {
            $this->listed[$source->code] ??= $this->readListPages($config['list_pages'], $config['url_pattern']);

            return array_keys(array_filter($this->listed[$source->code], fn (string $date): bool => str_starts_with($date, $month->format('Y-m'))));
        }

        foreach ($config['sitemaps'] as $template) {
            $url = strtr($template, ['{Y}' => $month->format('Y'), '{m}' => $month->format('m'), '{n}' => $month->format('n')]);
            $urls = [];
            foreach (str_contains($url, '{w}') ? range(1, 5) : [null] as $week) {
                try {
                    $xml = $this->fetcher->get(str_replace('{w}', (string) $week, $url));
                } catch (RequestException) {
                    continue; // Mẫu URL này không có cho tháng/tuần này (404), thử tiếp
                }

                preg_match_all('#<loc>\s*(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?\s*</loc>#s', $xml, $matches);
                array_push($urls, ...array_filter(
                    array_map(fn (string $loc): string => html_entity_decode(trim($loc)), $matches[1]),
                    fn (string $loc): bool => (bool) preg_match($config['url_pattern'], $loc),
                ));
            }

            $urls = array_values(array_unique($urls));
            if ($urls !== []) {
                return $urls;
            }
        }

        return [];
    }

    /**
     * @param  list<array{url: string, from?: int, to?: int}>  $listings
     * @return array<string, string> url bài => ngày đăng (Y-m-d) theo trang danh sách, theo thứ tự đọc
     */
    private function readListPages(array $listings, string $urlPattern): array
    {
        $found = [];
        foreach ($listings as $listing) {
            for ($page = $listing['from'] ?? 1; $page <= ($listing['to'] ?? 100); $page++) {
                try {
                    $html = $this->fetcher->get(str_replace('{page}', (string) $page, $listing['url']));
                } catch (RequestException) {
                    break;
                }

                $onPage = 0;
                preg_match_all('#href="([^"]+)"|datetime="([^"]+)"#', $html, $matches, PREG_SET_ORDER);
                $pending = [];
                foreach ($matches as $match) {
                    $url = html_entity_decode($match[1]);
                    if ($url !== '' && preg_match($urlPattern, $url)) {
                        $onPage++;
                        if (! isset($found[$url])) {
                            $pending[$url] = true;
                        }
                    } elseif (($match[2] ?? '') !== '' && $pending !== []) {
                        // Thẻ <time> đứng sau link bài trong cùng ô danh sách
                        $date = CarbonImmutable::parse($match[2])->setTimezone(config('app.timezone'))->toDateString();
                        foreach (array_keys($pending) as $pendingUrl) {
                            $found[$pendingUrl] = $date;
                        }
                        $pending = [];
                    }
                }

                if ($onPage === 0) {
                    break; // Hết bài: các trang sau cũng trống
                }
            }
        }

        return $found;
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
