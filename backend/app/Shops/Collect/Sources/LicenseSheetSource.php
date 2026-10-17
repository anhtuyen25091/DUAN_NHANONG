<?php

namespace App\Shops\Collect\Sources;

use App\Crawling\Fetcher;
use App\Enums\ShopType;
use App\Shops\Collect\CandidateData;
use App\Shops\Collect\ShopSource;
use OpenSpout\Reader\XLSX\Reader;

/**
 * Danh sách cơ sở được cấp giấy chứng nhận đủ điều kiện buôn bán phân bón / thuốc BVTV do Sở NN&MT công bố
 * dạng Excel (vd Hà Tĩnh: mỗi huyện 1 trang tính, cột "Họ và tên | Địa chỉ buôn bán | Số giấy CN | Ngày cấp").
 *
 * Tự tìm dòng tiêu đề trong mỗi trang tính (có cột tên + địa chỉ); trang tổng hợp không có tiêu đề đó thì bỏ qua.
 * Tên huyện lấy từ dòng tiêu đề phía trên ("HUYỆN THẠCH HÀ (đến tháng 05/2025)") để địa chỉ đủ rõ khi tra tọa độ.
 *
 * Cấu hình trong config/shops.php:
 *   'so-ha-tinh-pb' => ['class' => LicenseSheetSource::class, 'url' => '…xlsx', 'province' => 'ha-tinh',
 *       'types' => ['phan_bon'], 'label' => 'Sở NN&MT Hà Tĩnh: buôn bán phân bón', 'trust' => 85, 'page' => '…']
 */
class LicenseSheetSource implements ShopSource
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
        $url = $this->ckan !== null ? CkanResolver::latestOr($this->fetcher, $this->ckan['host'], $this->ckan['dataset'], ['XLSX'], $this->url) : $this->url;
        $file = tempnam(sys_get_temp_dir(), 'shops').'.xlsx';
        file_put_contents($file, $this->fetcher->get($url));

        try {
            yield from $this->read($file);
        } finally {
            @unlink($file);
        }
    }

    /**
     * @return iterable<CandidateData>
     */
    public function read(string $file): iterable
    {
        $reader = new Reader;
        $reader->open($file);

        try {
            foreach ($reader->getSheetIterator() as $sheet) {
                $rows = [];
                $district = null;
                $headerSeen = false;
                foreach ($sheet->getRowIterator() as $row) {
                    $cells = array_map(fn ($cell): string => $this->text($cell->getValue()), $row->getCells());
                    // Tên huyện cũ ở dòng tiêu đề phía trên bảng ("HUYỆN THẠCH HÀ (đến tháng 05/2025)")
                    $headerSeen = $headerSeen || LicenseTable::header($cells) !== null;
                    if (! $headerSeen) {
                        $district = $this->district([trim(implode(' ', $cells))]) ?? $district;
                    }
                    $rows[] = $cells;
                }
                yield from LicenseTable::candidates($rows, $this->province, $this->types, $this->page ?? $this->url, $sheet->getName(), $district);
            }
        } finally {
            $reader->close();
        }
    }

    /**
     * Tên huyện / thị xã / thành phố cũ trong các dòng phía trên tiêu đề, vd "HUYỆN THẠCH HÀ (đến tháng 05/2025)" → "huyện Thạch Hà".
     *
     * @param  list<string>  $lines
     */
    private function district(array $lines): ?string
    {
        foreach (array_reverse($lines) as $line) {
            if (preg_match('/^\s*(HUYỆN|THỊ XÃ|THÀNH PHỐ|TP\.?)\s+([^(]+?)\s*(\(|$)/iu', trim($line), $m) === 1) {
                $kind = mb_strtolower($m[1]) === 'tp' || mb_strtolower($m[1]) === 'tp.' ? 'thành phố' : mb_strtolower($m[1]);

                return $kind.' '.mb_convert_case(mb_strtolower(trim($m[2])), MB_CASE_TITLE);
            }
        }

        return null;
    }

    private function text(mixed $value): string
    {
        if ($value instanceof \DateTimeInterface) {
            return $value->format('d/m/Y');
        }

        return trim((string) $value);
    }
}
