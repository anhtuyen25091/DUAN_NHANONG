<?php

namespace App\Enums;

use Filament\Support\Contracts\HasLabel;

enum CategoryType: string implements HasLabel
{
    case NongSan = 'nong_san';
    case PhanBon = 'phan_bon';
    case ThuocBvtv = 'thuoc_bvtv';

    public function getLabel(): string
    {
        return match ($this) {
            self::NongSan => 'Nông sản',
            self::PhanBon => 'Phân bón',
            self::ThuocBvtv => 'Thuốc BVTV',
        };
    }
}
