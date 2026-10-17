<?php

namespace App\Shops\Collect\Sources;

use App\Crawling\Fetcher;
use App\Enums\ShopType;
use App\Shops\Collect\CandidateData;
use App\Shops\Collect\ShopSource;

/**
 * Danh sách cơ sở được cấp giấy đủ điều kiện buôn bán dạng file PDF có chữ (không phải bản scan).
 * Bảng được dựng lại theo vị trí chữ (PdfTable), rồi đọc như bảng Excel / HTML (LicenseTable).
 * Bản scan (ảnh) thì không có chữ: lệnh báo 0 điểm, cần nhận dạng chữ (OCR) riêng.
 *
 * Cấu hình trong config/shops.php:
 *   'so-x-bvtv' => ['class' => LicensePdfSource::class, 'url' => '…pdf', 'province' => '…', 'types' => ['thuoc_bvtv'],
 *       'label' => '…', 'trust' => 85, 'page' => 'trang có đường dẫn tới file']
 */
class LicensePdfSource implements ShopSource
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
        private ?string $page = null,
    ) {}

    /**
     * @param  array{url: string, province: string, types: list<string>, label: string, trust?: int, page?: string}  $config
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
            page: $config['page'] ?? null,
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
        return $this->read($this->fetcher->get($this->url));
    }

    /**
     * @return iterable<CandidateData>
     */
    public function read(string $pdfContent): iterable
    {
        return LicenseTable::candidates(PdfTable::rows($pdfContent), $this->province, $this->types, $this->page ?? $this->url);
    }
}
