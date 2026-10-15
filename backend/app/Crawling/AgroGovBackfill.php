<?php

namespace App\Crawling;

use App\Crawling\Adapters\ParsedPage;
use App\Crawling\Adapters\PriceRow;
use App\Crawling\Extraction\Text;
use App\Enums\CrawlStatus;
use App\Models\PriceSource;
use App\Models\Product;
use App\Models\Region;
use Carbon\CarbonImmutable;
use Dom\HTMLDocument;
use GuzzleHttp\Cookie\CookieJar;
use Illuminate\Http\Client\RequestException;
use Throwable;

/**
 * Lấy dữ liệu giá cũ từ CSDL giá của agro.gov.vn (trang tra cứu ASP.NET "nguonwmy.aspx").
 *
 * Mỗi tháng: tải form -> tra cứu mọi mặt hàng theo ngày trong tháng -> "Xuất ra excel" (bảng HTML UTF-16 đủ mọi dòng).
 * Xuất Excel lỗi (trang trả 500) thì đọc lưới kết quả từng trang (20 dòng/trang).
 * Bảng có 4 cột: tên mặt hàng ("Tên Việt|English"), thị trường (tỉnh/vùng), ngày, giá.
 *
 * Cấu hình price_sources.config:
 * - categories: chỉ nhận mặt hàng thuộc các danh mục (slug) này; tên mặt hàng phải trùng hẳn tên/alias (không so khớp một phần)
 * - price_ranges: {"slug danh mục": [min, max]} giá hợp lý theo đơn vị của trang (đồng/kg); ngoài khoảng thì bỏ
 *   (trang lẫn đơn vị: có dòng ghi giá bao, có dòng ghi nghìn đồng)
 * - unit_factor: {"slug danh mục": hệ số} quy giá trang (đồng/kg) ra đơn vị mặt hàng, vd phân bón tính theo bao 50 kg => 50
 * - backfill: {"strategy": "agro_gov"}
 */
class AgroGovBackfill
{
    public const FORM_URL = 'https://agro.gov.vn/vn/nguonwmy.aspx';

    private const FIELD = 'ctl00$maincontent$';

    /** Số trang lưới tối đa đọc khi không xuất được Excel (20 dòng/trang) */
    private const MAX_GRID_PAGES = 200;

    public function __construct(
        private Fetcher $fetcher,
        private PriceImporter $importer,
    ) {}

    /**
     * @param  callable(string, string): void|null  $progress
     * @return array{articles: int, done_before: int, imported: int, failed: int}
     */
    public function runMonth(PriceSource $source, CarbonImmutable $month, ?callable $progress = null): array
    {
        $month = $month->startOfMonth();
        $logUrl = self::FORM_URL.'?thang='.$month->format('Y-m');
        $stats = ['articles' => 1, 'done_before' => 0, 'imported' => 0, 'failed' => 0];

        // Tháng đã qua và đã lấy xong thì bỏ qua; tháng hiện tại luôn lấy lại (còn thêm ngày mới)
        $isCurrentMonth = $month->isSameMonth(CarbonImmutable::today());
        if (! $isCurrentMonth && $source->crawlLogs()->where('url', $logUrl)->whereIn('status', [CrawlStatus::Success, CrawlStatus::Empty])->exists()) {
            $stats['done_before'] = 1;

            return $stats;
        }

        $to = $isCurrentMonth ? CarbonImmutable::today() : $month->endOfMonth()->startOfDay();

        try {
            $rows = $this->fetchRows($month, $to);
            [$pages, $skipped] = $this->toPages($source, $rows);

            $imported = 0;
            foreach ($pages as $date => $page) {
                $counts = $this->importer->import($source, CarbonImmutable::parse($date), self::FORM_URL, $page);
                $imported += $counts['imported'];
                $skipped += $counts['skipped'];
            }

            $message = sprintf('Dữ liệu cũ agro.gov.vn %s: %d dòng, lưu %d giá (%d ngày), bỏ %d dòng sai đơn vị/ngoài khoảng.', $month->format('m/Y'), count($rows), $imported, count($pages), $skipped);
            $this->log($source, $month, $logUrl, $imported > 0 ? CrawlStatus::Success : CrawlStatus::Empty, $message, $imported);
            $stats['imported'] = $imported;
            $progress && $progress($logUrl, $message);
        } catch (Throwable $e) {
            if (! $e instanceof CrawlBlockedException) {
                report($e);
            }
            $this->log($source, $month, $logUrl, CrawlStatus::Failed, 'Dữ liệu cũ agro.gov.vn: '.$e->getMessage(), 0);
            $stats['failed'] = 1;
            $progress && $progress($logUrl, 'Lỗi: '.$e->getMessage());
        }

        return $stats;
    }

    /**
     * Mọi dòng giá (mọi mặt hàng) từ ngày $from tới $to.
     *
     * @return list<array{name: string, market: string, date: CarbonImmutable, price: float}>
     */
    public function fetchRows(CarbonImmutable $from, CarbonImmutable $to): array
    {
        $cookies = new CookieJar;
        $query = [
            self::FIELD.'Theo_thời_gian' => 'ngay',
            self::FIELD.'mathangnongsan' => '',
            self::FIELD.'tu_ngay' => $from->format('d/m/Y'),
            self::FIELD.'den_ngay' => $to->format('d/m/Y'),
        ];

        $form = $this->fetcher->submit(self::FORM_URL, null, $cookies);
        $result = $this->fetcher->submit(self::FORM_URL, [...$this->hiddenFields($form), ...$query, self::FIELD.'Xem' => 'Tra cứu'], $cookies);

        $gridRows = $this->parseRows($result);
        if ($gridRows === []) {
            return []; // Không có dữ liệu trong khoảng ngày này
        }

        try {
            $export = $this->fetcher->submit(self::FORM_URL, [...$this->hiddenFields($result), ...$query, self::FIELD.'tai_excel' => 'Xuất ra excel'], $cookies, retryServerErrors: false);
            $rows = $this->parseRows($this->toUtf8($export));
            if ($rows !== []) {
                return $rows;
            }
        } catch (RequestException) {
            // Xuất Excel đôi khi lỗi 500: đọc lưới từng trang
        }

        $rows = $gridRows;
        $page = $result;
        for ($number = 2; $number <= self::MAX_GRID_PAGES && str_contains(html_entity_decode($page), "Page\${$number}"); $number++) {
            $page = $this->fetcher->submit(self::FORM_URL, [
                ...$this->hiddenFields($page),
                ...$query,
                '__EVENTTARGET' => self::FIELD.'GridView1',
                '__EVENTARGUMENT' => "Page\${$number}",
            ], $cookies);
            array_push($rows, ...$this->parseRows($page));
        }

        return $rows;
    }

    /**
     * Gom dòng khớp mặt hàng + khu vực thành từng ngày (theo thứ tự ngày tăng dần để so giá bất thường với ngày trước).
     *
     * @param  list<array{name: string, market: string, date: CarbonImmutable, price: float}>  $rows
     * @return array{0: array<string, ParsedPage>, 1: int} [ngày => trang, số dòng bỏ vì giá ngoài khoảng]
     */
    public function toPages(PriceSource $source, array $rows): array
    {
        $categories = (array) $source->configValue('categories', []);
        $ranges = (array) $source->configValue('price_ranges', []);
        $factors = (array) $source->configValue('unit_factor', []);

        $products = [];
        Product::query()->active()->with('category:id,slug')
            ->whereHas('category', fn ($query) => $query->whereIn('slug', $categories))
            ->get(['id', 'category_id', 'name', 'aliases'])
            ->each(function (Product $product) use (&$products): void {
                foreach ([$product->name, ...($product->aliases ?? [])] as $name) {
                    $products[self::key($name)] ??= $product;
                }
            });

        $regions = [];
        Region::query()->orderBy('id')->get(['id', 'name', 'aliases'])->each(function (Region $region) use (&$regions): void {
            foreach ([$region->name, ...($region->aliases ?? [])] as $name) {
                $regions[self::key($name)] ??= $region->id;
            }
        });

        $byDate = [];
        $skipped = 0;
        foreach ($rows as $row) {
            $product = $products[self::key($row['name'])] ?? null;
            $regionId = $regions[self::key($row['market'])] ?? null;
            if ($product === null || $regionId === null) {
                continue;
            }

            $slug = $product->category->slug;
            [$min, $max] = $ranges[$slug] ?? [0, PHP_INT_MAX];
            if ($row['price'] < $min || $row['price'] > $max) {
                $skipped++;

                continue;
            }

            $price = (int) round($row['price'] * ($factors[$slug] ?? 1));
            $byDate[$row['date']->toDateString()][$product->id.'|'.$regionId] ??= new PriceRow($product->id, $regionId, $price, $price, $price, $product->unit);
        }

        ksort($byDate);

        return [array_map(fn (array $priceRows): ParsedPage => new ParsedPage(array_values($priceRows)), $byDate), $skipped];
    }

    /**
     * Đọc các dòng 4 cột (tên, thị trường, ngày, giá) của lưới kết quả hoặc file xuất Excel.
     *
     * @return list<array{name: string, market: string, date: CarbonImmutable, price: float}>
     */
    public function parseRows(string $html): array
    {
        $document = HTMLDocument::createFromString($html, LIBXML_NOERROR, 'UTF-8');
        $rows = [];

        foreach ($document->querySelectorAll('tr') as $tr) {
            $cells = array_map(fn ($cell): string => trim(preg_replace('/\s+/u', ' ', $cell->textContent ?? '') ?? ''), iterator_to_array($tr->querySelectorAll('td'), false));
            if (count($cells) !== 4 || ! is_numeric($cells[3])) {
                continue;
            }

            $date = $this->parseDate($cells[2]);
            if ($date === null) {
                continue;
            }

            $rows[] = [
                'name' => trim(explode('|', $cells[0])[0]),
                'market' => trim(explode('|', $cells[1])[0]),
                'date' => $date,
                'price' => (float) $cells[3],
            ];
        }

        return $rows;
    }

    /**
     * Lưới ghi "28-06-2024" (ngày-tháng-năm), file Excel ghi "11/30/2021 12:00:00 AM" (tháng/ngày/năm).
     */
    private function parseDate(string $value): ?CarbonImmutable
    {
        if (preg_match('#^(\d{1,2})-(\d{1,2})-(\d{4})#', $value, $m)) {
            return CarbonImmutable::createSafe((int) $m[3], (int) $m[2], (int) $m[1])?->startOfDay();
        }
        if (preg_match('#^(\d{1,2})/(\d{1,2})/(\d{4})#', $value, $m)) {
            return CarbonImmutable::createSafe((int) $m[3], (int) $m[1], (int) $m[2])?->startOfDay();
        }

        return null;
    }

    /**
     * @return array<string, string>
     */
    private function hiddenFields(string $html): array
    {
        $document = HTMLDocument::createFromString($html, LIBXML_NOERROR, 'UTF-8');
        $fields = [];
        foreach ($document->querySelectorAll('input[type="hidden"]') as $input) {
            $name = $input->getAttribute('name');
            if ($name !== null && $name !== '') {
                $fields[$name] = (string) $input->getAttribute('value');
            }
        }

        return $fields;
    }

    private function toUtf8(string $body): string
    {
        if (str_starts_with($body, "\xFF\xFE") || str_starts_with($body, "\xFE\xFF")) {
            $body = mb_convert_encoding(substr($body, 2), 'UTF-8', str_starts_with($body, "\xFF\xFE") ? 'UTF-16LE' : 'UTF-16BE');
        } elseif (strlen($body) > 1 && $body[1] === "\0") {
            $body = mb_convert_encoding($body, 'UTF-8', 'UTF-16LE');
        }

        return '<meta charset="utf-8">'.$body;
    }

    /**
     * Khóa so khớp tên: bỏ dấu, chữ thường, bỏ khoảng trắng/gạch ngang/ngoặc (tên trên trang viết không đều).
     */
    private static function key(string $name): string
    {
        return str_replace([' ', '-'], '', Text::normalize(explode('|', $name)[0]));
    }

    private function log(PriceSource $source, CarbonImmutable $month, string $url, CrawlStatus $status, string $message, int $items): void
    {
        $source->crawlLogs()->create([
            'target_date' => $month->toDateString(),
            'url' => $url,
            'status' => $status,
            'items_count' => $items,
            'message' => $message,
        ]);
    }
}
