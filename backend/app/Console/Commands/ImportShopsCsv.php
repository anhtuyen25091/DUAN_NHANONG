<?php

namespace App\Console\Commands;

use App\Enums\ShopType;
use App\Models\Shop;
use App\Shops\ShopClassifier;
use App\Support\Provinces;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

/**
 * Nhập danh sách điểm bán từ file CSV (UTF-8, có dòng tiêu đề), ví dụ danh sách cơ sở
 * đủ điều kiện buôn bán phân bón / thuốc BVTV do Sở NN&MT công bố.
 *
 * Cột: ten, loai, dia_chi, tinh, sdt, mat_hang, lat, lng (chỉ "ten" là bắt buộc).
 * "loai": thu_mua, phan_bon, thuoc_bvtv, cách nhau bởi dấu | ; để trống thì đoán theo tên.
 */
#[Signature('shops:import-csv {file} {--source=import : Ghi chú nguồn} {--verified : Đánh dấu đã xác minh}')]
#[Description('Nhập điểm bán từ file CSV')]
class ImportShopsCsv extends Command
{
    public function handle(): int
    {
        $path = (string) $this->argument('file');
        $handle = is_readable($path) ? fopen($path, 'r') : false;
        if ($handle === false) {
            $this->error("Không đọc được file {$path}");

            return self::FAILURE;
        }

        $header = fgetcsv($handle, escape: '');
        $header = array_map(fn ($column): string => trim(preg_replace('/^\xEF\xBB\xBF/', '', (string) $column) ?? ''), $header ?: []);
        if (! in_array('ten', $header, true)) {
            $this->error('File cần có cột "ten".');

            return self::FAILURE;
        }

        $imported = 0;
        $skipped = 0;
        $line = 1;
        while (($row = fgetcsv($handle, escape: '')) !== false) {
            $line++;
            if (count($row) !== count($header)) {
                $this->warn("Dòng {$line}: số cột không khớp, bỏ qua.");
                $skipped++;

                continue;
            }

            $data = array_map(fn ($value): string => trim((string) $value), array_combine($header, $row));
            $name = $data['ten'] ?? '';
            $types = array_values(array_filter(array_map(
                fn (string $value): ?ShopType => ShopType::tryFrom(trim($value)),
                explode('|', $data['loai'] ?? ''),
            )));
            $types = $types !== [] ? $types : ShopClassifier::classify($name);

            if ($name === '' || $types === []) {
                $this->warn("Dòng {$line}: thiếu tên hoặc không rõ loại, bỏ qua.");
                $skipped++;

                continue;
            }

            $address = ($data['dia_chi'] ?? '') ?: null;
            $attributes = [
                'name' => $name,
                'types' => $types,
                'address' => $address,
                'province_code' => Provinces::detect(($data['tinh'] ?? '') ?: $address),
                'phone' => ($data['sdt'] ?? '') ?: null,
                'goods' => ($data['mat_hang'] ?? '') ?: null,
                'lat' => is_numeric($data['lat'] ?? null) ? (float) $data['lat'] : null,
                'lng' => is_numeric($data['lng'] ?? null) ? (float) $data['lng'] : null,
                'source' => (string) $this->option('source'),
                'is_verified' => (bool) $this->option('verified'),
            ];

            // Cùng tên + địa chỉ thì cập nhật, không tạo trùng
            Shop::query()->updateOrCreate(['name' => $name, 'address' => $address], $attributes);
            $imported++;
        }
        fclose($handle);

        $this->info("Nhập {$imported} điểm, bỏ qua {$skipped} dòng.");

        return self::SUCCESS;
    }
}
