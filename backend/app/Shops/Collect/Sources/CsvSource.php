<?php

namespace App\Shops\Collect\Sources;

use App\Enums\ShopType;
use App\Shops\Collect\CandidateData;
use App\Shops\Collect\ShopSource;
use RuntimeException;

/**
 * Danh sách điểm bán dạng file CSV (UTF-8, có dòng tiêu đề), vd danh sách cơ sở đủ điều kiện buôn bán
 * phân bón / thuốc BVTV của Sở đã chuyển từ PDF / Excel.
 *
 * Cột (tên cột không phân biệt hoa thường; chỉ "ten" bắt buộc):
 *   ma (số giấy chứng nhận / mã trong nguồn), ten, loai (thu_mua|phan_bon|thuoc_bvtv, cách nhau bởi |),
 *   dia_chi, tinh, sdt, mat_hang, lat, lng, url
 * Không có cột "ma" thì lấy tên + địa chỉ làm mã.
 */
class CsvSource implements ShopSource
{
    /**
     * @param  list<ShopType>  $defaultTypes  loại điểm khi file không có cột "loai" (vd danh sách buôn bán phân bón)
     */
    public function __construct(
        private string $path,
        private string $key,
        private string $label,
        private int $trust,
        private array $defaultTypes = [],
        private ?string $url = null,
    ) {}

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
        $handle = is_readable($this->path) ? fopen($this->path, 'r') : false;
        if ($handle === false) {
            throw new RuntimeException("Không đọc được file {$this->path}");
        }

        try {
            $header = fgetcsv($handle, escape: '');
            if ($header === false) {
                return;
            }
            // Bỏ BOM UTF-8 ở đầu file (Excel hay thêm)
            $header = array_map(fn ($h): string => mb_strtolower(trim((string) preg_replace('/^\x{FEFF}/u', '', (string) $h))), $header);

            while (($row = fgetcsv($handle, escape: '')) !== false) {
                if ($row === [null] || count($row) < count($header)) {
                    $row = array_pad($row, count($header), null);
                }
                $values = array_combine($header, array_slice($row, 0, count($header)));
                $get = fn (string $column): ?string => isset($values[$column]) && trim((string) $values[$column]) !== '' ? trim((string) $values[$column]) : null;

                $name = $get('ten');
                if ($name === null) {
                    continue;
                }
                $types = array_values(array_filter(array_map(
                    fn (string $t): ?ShopType => ShopType::tryFrom(trim($t)),
                    explode('|', (string) $get('loai')),
                )));

                yield new CandidateData(
                    ref: $get('ma') ?? md5(mb_strtolower($name.'|'.$get('dia_chi'))),
                    name: $name,
                    address: $get('dia_chi'),
                    province: $get('tinh'),
                    phone: $get('sdt'),
                    types: $types !== [] ? $types : $this->defaultTypes,
                    goods: $get('mat_hang'),
                    lat: $get('lat') !== null ? (float) $get('lat') : null,
                    lng: $get('lng') !== null ? (float) $get('lng') : null,
                    url: $get('url') ?? $this->url,
                    raw: array_filter($values, fn ($v): bool => $v !== null && $v !== ''),
                );
            }
        } finally {
            fclose($handle);
        }
    }
}
