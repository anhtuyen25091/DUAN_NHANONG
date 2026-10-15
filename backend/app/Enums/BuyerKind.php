<?php

namespace App\Enums;

use Filament\Support\Contracts\HasLabel;

/** Loại điểm mua đăng giá */
enum BuyerKind: string implements HasLabel
{
    case Company = 'doanh_nghiep';
    case Agent = 'dai_ly';
    case Trader = 'thuong_lai';
    case Retail = 'ban_le';

    public function getLabel(): string
    {
        return match ($this) {
            self::Company => 'Doanh nghiệp',
            self::Agent => 'Đại lý / cửa hàng',
            self::Trader => 'Thương lái',
            self::Retail => 'Điểm bán lẻ',
        };
    }
}
