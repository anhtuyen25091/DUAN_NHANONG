<?php

namespace App\Console\Commands;

use App\Crawling\Fetcher;
use App\Enums\ShopType;
use App\Shops\Collect\ShopCollector;
use App\Shops\Collect\Sources\CallbackSource;
use App\Shops\Collect\Sources\CsvSource;
use App\Shops\Collect\Sources\LicenseDocxSource;
use App\Shops\Collect\Sources\LicensePdfSource;
use App\Shops\Collect\Sources\LicenseSheetSource;
use App\Support\Provinces;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

/**
 * Vd danh sách cơ sở buôn bán phân bón của Sở NN&MT Đồng Tháp (đã chuyển sang CSV):
 *   php artisan shops:collect-file dong-thap-phan-bon.csv --source=so-dong-thap-pb --label="Sở NN&MT Đồng Tháp: buôn bán phân bón" --type=phan_bon --url=https://...
 */
#[Signature('shops:collect-file {file : File .csv (cột: ma, ten, loai, dia_chi, tinh, sdt, mat_hang, lat, lng, url), hoặc .xlsx / .docx / .pdf (danh sách cấp phép của Sở, cần --province)}
    {--province= : Mã tỉnh (vd dong-thap) khi file là .xlsx / .docx / .pdf}
    {--source= : Khóa nguồn, vd so-dong-thap-pb (bắt buộc, giữ nguyên giữa các lần nhập)}
    {--label= : Tên nguồn hiển thị cho admin}
    {--trust=85 : Độ tin cậy 0–100 (danh sách cấp phép của Sở 85, đại lý của hãng 80, danh bạ 50)}
    {--type=* : Loại điểm khi file không có cột "loai": thu_mua, phan_bon, thuoc_bvtv}
    {--url= : Đường dẫn văn bản gốc}
    {--no-process : Chỉ lưu vào bảng chờ}')]
#[Description('Thu thập điểm bán từ file CSV / Excel / PDF (danh sách của Sở, của hãng…) vào bảng chờ')]
class CollectShopsFile extends Command
{
    public function handle(ShopCollector $collector): int
    {
        $key = (string) $this->option('source');
        if (preg_match('/^[a-z0-9][a-z0-9\-]{1,39}$/', $key) !== 1) {
            $this->error('Cần --source: chữ thường không dấu, số, gạch ngang (tối đa 40 ký tự).');

            return self::FAILURE;
        }
        $types = [];
        foreach ((array) $this->option('type') as $type) {
            $parsed = ShopType::tryFrom((string) $type);
            if ($parsed === null) {
                $this->error("Loại \"{$type}\" không đúng (thu_mua, phan_bon, thuoc_bvtv).");

                return self::FAILURE;
            }
            $types[] = $parsed;
        }

        $path = (string) $this->argument('file');
        $label = (string) ($this->option('label') ?: $key);
        $trust = max(0, min(100, (int) $this->option('trust')));
        $url = $this->option('url') ?: null;
        $extension = strtolower(pathinfo($path, PATHINFO_EXTENSION));

        if ($extension === 'csv') {
            $source = new CsvSource(path: $path, key: $key, label: $label, trust: $trust, defaultTypes: $types, url: $url);
        } else {
            $province = (string) $this->option('province');
            if (Provinces::name($province) === null || $types === [] || ! in_array($extension, ['xlsx', 'docx', 'pdf'], true) || ! is_readable($path)) {
                $this->error('File .xlsx / .docx / .pdf cần --province=<mã tỉnh> và ít nhất 1 --type; chỉ nhận .csv, .xlsx, .docx, .pdf đọc được.');

                return self::FAILURE;
            }
            $fetcher = app(Fetcher::class);
            $read = match ($extension) {
                'xlsx' => fn (): iterable => (new LicenseSheetSource($fetcher, $key, $label, $url ?? $path, $province, $types, $trust, $url))->read($path),
                'docx' => fn (): iterable => (new LicenseDocxSource($fetcher, $key, $label, $url ?? $path, $province, $types, $trust, $url))->read((string) file_get_contents($path)),
                default => fn (): iterable => (new LicensePdfSource($fetcher, $key, $label, $url ?? $path, $province, $types, $trust, $url))->read((string) file_get_contents($path)),
            };
            $source = new CallbackSource($key, $label, $trust, $read);
        }

        $counts = $collector->collect($source);
        $this->info("{$source->label()}: mới {$counts['new']}, cập nhật {$counts['updated']}, bỏ qua {$counts['skipped']}.");
        if (! $this->option('no-process')) {
            $result = $collector->process($key);
            $this->line("Đưa vào danh sách {$result['published']}, chờ duyệt {$result['pending']}, để lần sau (lỗi tra tọa độ) {$result['deferred']}.");
        }

        return self::SUCCESS;
    }
}
