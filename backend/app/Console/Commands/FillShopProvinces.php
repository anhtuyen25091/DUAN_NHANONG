<?php

namespace App\Console\Commands;

use App\Models\Shop;
use App\Support\PlaceSearch;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('shops:fill-provinces {--delay=1 : Giãn cách giữa 2 lần tra (giây), để không làm phiền dịch vụ miễn phí}')]
#[Description('Điền tỉnh cho điểm bán chưa có tỉnh, tra ngược từ tọa độ')]
class FillShopProvinces extends Command
{
    public function handle(PlaceSearch $places): int
    {
        $shops = Shop::query()->whereNull('province_code')->whereNotNull('lat')->whereNotNull('lng')->get();
        $filled = 0;
        foreach ($shops as $i => $shop) {
            if ($i > 0) {
                usleep((int) ((float) $this->option('delay') * 1_000_000));
            }
            $province = $places->provinceAt((float) $shop->lat, (float) $shop->lng);
            if ($province !== null) {
                $shop->forceFill(['province_code' => $province])->save();
                $filled++;
            }
        }
        $this->info("Đã điền tỉnh {$filled}/{$shops->count()} điểm bán.");

        return self::SUCCESS;
    }
}
