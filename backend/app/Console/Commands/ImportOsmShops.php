<?php

namespace App\Console\Commands;

use App\Shops\OsmShopImporter;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('shops:import-osm')]
#[Description('Nhập điểm bán phân bón / thuốc BVTV / thu mua từ OpenStreetMap')]
class ImportOsmShops extends Command
{
    public function handle(OsmShopImporter $importer): int
    {
        $counts = $importer->run();
        $this->info("Thêm {$counts['imported']}, cập nhật {$counts['updated']}, bỏ qua {$counts['skipped']}.");

        return self::SUCCESS;
    }
}
