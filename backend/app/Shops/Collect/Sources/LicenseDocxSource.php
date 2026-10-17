<?php

namespace App\Shops\Collect\Sources;

use App\Crawling\Fetcher;
use App\Enums\ShopType;
use App\Shops\Collect\CandidateData;
use App\Shops\Collect\ShopSource;

/**
 * Danh sách cơ sở được cấp giấy đủ điều kiện buôn bán dạng file Word (.docx), vd cổng dữ liệu mở Thanh Hóa.
 * Đọc mọi bảng trong file, dòng tiêu đề (có thể 2 tầng) tìm theo tên cột (LicenseTable).
 *
 * Cấu hình trong config/shops.php:
 *   'so-x-bvtv' => ['class' => LicenseDocxSource::class, 'url' => '…docx', 'province' => '…', 'types' => ['thuoc_bvtv'],
 *       'label' => '…', 'trust' => 85, 'page' => 'trang có đường dẫn tới file']
 */
class LicenseDocxSource implements ShopSource
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
        /** @var array{host: string, dataset: string}|null bộ dữ liệu trên cổng CKAN: lấy file mới nhất mỗi lần chạy */
        private ?array $ckan = null,
    ) {}

    /**
     * @param  array{url?: string, ckan?: array{host: string, dataset: string}, province: string, types: list<string>, label: string, trust?: int, page?: string}  $config
     */
    public static function fromConfig(string $key, array $config): self
    {
        return new self(
            fetcher: app(Fetcher::class),
            key: $key,
            label: $config['label'],
            url: $config['url'] ?? '',
            province: $config['province'],
            types: array_map(fn (string $t): ShopType => ShopType::from($t), $config['types']),
            trust: $config['trust'] ?? 85,
            page: $config['page'] ?? null,
            ckan: $config['ckan'] ?? null,
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
        $url = $this->ckan !== null ? CkanResolver::latest($this->fetcher, $this->ckan['host'], $this->ckan['dataset'], ['DOCX']) : $this->url;

        return $this->read($this->fetcher->get($url));
    }

    /**
     * @return iterable<CandidateData>
     */
    public function read(string $docxContent): iterable
    {
        return LicenseTable::candidates(DocxTable::rows($docxContent), $this->province, $this->types, $this->page ?? $this->url);
    }
}
