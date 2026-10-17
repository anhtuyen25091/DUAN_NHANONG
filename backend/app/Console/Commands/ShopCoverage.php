<?php

namespace App\Console\Commands;

use App\Enums\CandidateStatus;
use App\Enums\ShopType;
use App\Models\Shop;
use App\Models\ShopCandidate;
use App\Support\Provinces;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('shops:coverage')]
#[Description('Độ phủ điểm bán theo tỉnh: số điểm từng loại, số điểm vị trí gần đúng, số điểm chờ duyệt')]
class ShopCoverage extends Command
{
    public function handle(): int
    {
        $shops = Shop::query()->active()->get(['province_code', 'types', 'geo_precision']);
        $pending = ShopCandidate::query()->where('status', CandidateStatus::Pending)
            ->selectRaw('province_code, count(*) as c')->groupBy('province_code')->pluck('c', 'province_code');

        $rows = [];
        $totals = array_fill(0, 6, 0);
        foreach ([...Provinces::options(), '' => '(không rõ tỉnh)'] as $code => $name) {
            $inProvince = $shops->filter(fn (Shop $s): bool => (string) $s->province_code === (string) $code);
            $row = [
                $inProvince->filter(fn (Shop $s): bool => $s->types->contains(ShopType::ThuMua))->count(),
                $inProvince->filter(fn (Shop $s): bool => $s->types->contains(ShopType::PhanBon))->count(),
                $inProvince->filter(fn (Shop $s): bool => $s->types->contains(ShopType::ThuocBvtv))->count(),
                $inProvince->count(),
                $inProvince->where('geo_precision', 'province')->count(),
                (int) ($pending[$code === '' ? null : $code] ?? 0),
            ];
            foreach ($row as $i => $value) {
                $totals[$i] += $value;
            }
            $rows[] = [$name, ...$row];
        }
        $rows[] = ['TỔNG', ...$totals];

        $this->table(['Tỉnh', 'Thu mua', 'Phân bón', 'BVTV', 'Tổng điểm', 'Vị trí gần đúng', 'Chờ duyệt'], $rows);

        return self::SUCCESS;
    }
}
