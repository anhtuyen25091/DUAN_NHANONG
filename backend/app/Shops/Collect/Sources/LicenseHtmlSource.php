<?php

namespace App\Shops\Collect\Sources;

use App\Crawling\Fetcher;
use App\Enums\ShopType;
use App\Shops\Collect\CandidateData;
use App\Shops\Collect\ShopSource;
use DOMDocument;
use DOMXPath;

/**
 * Danh sách cơ sở được cấp giấy đủ điều kiện buôn bán dạng bảng HTML chia trang
 * (vd cổng dữ liệu mở Sơn La: ?page=1, 2…, mỗi trang 10 dòng; cột Tên | Thôn/Bản | Xã | Huyện | Điện thoại | Số giấy).
 * Đọc lần lượt các trang tới khi hết dòng (hoặc trang lặp lại trang trước).
 *
 * Cấu hình trong config/shops.php:
 *   'so-son-la-pb' => ['class' => LicenseHtmlSource::class, 'url' => 'https://…?page={page}', 'province' => 'son-la',
 *       'types' => ['phan_bon'], 'label' => '…', 'trust' => 85, 'max_pages' => 200]
 */
class LicenseHtmlSource implements ShopSource
{
    /**
     * @param  list<ShopType>  $types
     */
    public function __construct(
        private Fetcher $fetcher,
        private string $key,
        private string $label,
        private string $url,
        private string $province,
        private array $types,
        private int $trust = 85,
        private int $maxPages = 200,
    ) {}

    /**
     * @param  array{url: string, province: string, types: list<string>, label: string, trust?: int, max_pages?: int}  $config
     */
    public static function fromConfig(string $key, array $config): self
    {
        return new self(
            fetcher: app(Fetcher::class),
            key: $key,
            label: $config['label'],
            url: $config['url'],
            province: $config['province'],
            types: array_map(fn (string $t): ShopType => ShopType::from($t), $config['types']),
            trust: $config['trust'] ?? 85,
            maxPages: $config['max_pages'] ?? 200,
        );
    }

    public function key(): string
    {
        return $this->key;
    }

    public function label(): string
    {
        return $this->label;
    }

    public function trust(): int
    {
        return $this->trust;
    }

    public function collect(): iterable
    {
        $previousFirst = null;
        for ($page = 1; $page <= $this->maxPages; $page++) {
            $url = str_replace('{page}', (string) $page, $this->url);
            $rows = $this->rows($this->fetcher->get($url));
            // Hết dòng, hoặc trang vượt quá số trang mà nguồn trả lại trang cuối: dừng (so dòng dữ liệu đầu, dòng 0 là tiêu đề)
            if (count($rows) < 2 || $rows[1] === $previousFirst) {
                return;
            }
            $previousFirst = $rows[1];
            yield from $this->parse($rows, str_replace('{page}', '1', $this->url));
        }
    }

    /**
     * @param  list<list<string>>  $rows
     * @return iterable<CandidateData>
     */
    public function parse(array $rows, ?string $url = null): iterable
    {
        $columns = null;
        foreach ($rows as $cells) {
            if ($columns === null) {
                $columns = LicenseTable::header($cells);

                continue;
            }
            $candidate = LicenseTable::candidate($cells, $columns, null, $this->province, $this->types, $url, 'r');
            if ($candidate !== null) {
                yield $candidate;
            }
        }
    }

    /**
     * Các dòng của bảng đầu tiên có dòng tiêu đề danh sách (gồm cả dòng tiêu đề).
     *
     * @return list<list<string>>
     */
    public function rows(string $html): array
    {
        $dom = new DOMDocument;
        @$dom->loadHTML('<?xml encoding="UTF-8">'.$html, LIBXML_NOERROR | LIBXML_NOWARNING);
        $xpath = new DOMXPath($dom);

        foreach ($xpath->query('//table') ?: [] as $table) {
            $rows = [];
            foreach ($xpath->query('.//tr', $table) ?: [] as $tr) {
                $cells = [];
                foreach ($xpath->query('./th|./td', $tr) ?: [] as $cell) {
                    $cells[] = trim((string) preg_replace('/\s+/u', ' ', $cell->textContent));
                }
                if ($cells !== []) {
                    $rows[] = $cells;
                }
            }
            if ($rows !== [] && LicenseTable::header($rows[0]) !== null && count($rows) > 1) {
                return $rows;
            }
        }

        return [];
    }
}
