<?php

namespace App\Enums;

/**
 * Phiếu của điểm thu mua: mua vào (từ nông dân) hoặc bán ra (cho công ty, vựa lớn).
 */
enum PurchaseKind: string
{
    case Buy = 'buy';
    case Sell = 'sell';

    public function label(): string
    {
        return match ($this) {
            self::Buy => 'Mua vào',
            self::Sell => 'Bán ra',
        };
    }

    /** Tiền tố số phiếu: PM-000012 (phiếu mua), PB-000003 (phiếu bán) */
    public function prefix(): string
    {
        return match ($this) {
            self::Buy => 'PM',
            self::Sell => 'PB',
        };
    }

    public function title(): string
    {
        return match ($this) {
            self::Buy => 'PHIẾU MUA HÀNG',
            self::Sell => 'PHIẾU BÁN HÀNG',
        };
    }
}
