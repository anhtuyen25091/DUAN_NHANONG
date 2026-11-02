<?php

namespace App\Shops\Collect\Sources;

use App\Crawling\Fetcher;
use App\Enums\ShopType;
use App\Shops\Collect\CandidateData;
use App\Shops\Collect\ShopSource;

/**
 * Danh sách cơ sở được cấp giấy đủ điều kiện buôn bán dạng file PDF.
 * Bảng được dựng lại theo vị trí chữ (PdfTable), rồi đọc như bảng Excel / HTML (LicenseTable).
 * Bản scan (ảnh, không có lớp chữ): nhận dạng chữ bằng tesseract (PdfOcr) rồi dựng bảng cùng cách; các điểm đọc từ OCR
 * có raw['ocr'] = true để luôn chờ admin duyệt. Máy chưa cài công cụ OCR thì báo OcrUnavailableException (bỏ qua nguồn).
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
        private ?PdfOcr $ocr = null,
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
        $pages = PdfTable::pages($pdfContent);
        if (PdfTable::hasTextLayer($pages)) {
            return LicenseTable::candidates(PdfTable::fromPages($pages), $this->province, $this->types, $this->page ?? $this->url);
        }
        if ($pages === []) {
            return [];
        }

        // Bản scan: OCR từng trang rồi dựng bảng như PDF có chữ
        $ocrPages = ($this->ocr ?? app(PdfOcr::class))->pages($pdfContent, count($pages));

        return self::markOcr(LicenseTable::candidates(PdfTable::fromPages($ocrPages), $this->province, $this->types, $this->page ?? $this->url));
    }

    /**
     * Đánh dấu điểm đọc từ OCR (chữ có thể sai): CandidateProcessor để các điểm này chờ admin duyệt.
     *
     * @param  iterable<CandidateData>  $candidates
     * @return iterable<CandidateData>
     */
    private static function markOcr(iterable $candidates): iterable
    {
        foreach ($candidates as $candidate) {
            yield new CandidateData(...[...get_object_vars($candidate), 'raw' => [...$candidate->raw, 'ocr' => true]]);
        }
    }
}
