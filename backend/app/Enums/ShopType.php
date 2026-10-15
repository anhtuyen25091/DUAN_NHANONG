<?php

namespace App\Enums;

use Filament\Support\Contracts\HasLabel;

enum ShopType: string implements HasLabel
{
    /** Điểm thu mua nông sản (đại lý cà phê, vựa lúa…) */
    case ThuMua = 'thu_mua';

    case PhanBon = 'phan_bon';

    case ThuocBvtv = 'thuoc_bvtv';

    public function getLabel(): string
    {
        return match ($this) {
            self::ThuMua => 'Thu mua nông sản',
            self::PhanBon => 'Bán phân bón',
            self::ThuocBvtv => 'Bán thuốc BVTV',
        };
    }
}
