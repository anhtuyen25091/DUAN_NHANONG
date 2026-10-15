<?php

namespace App\Enums;

/**
 * Loại mục trong đơn mua bán. Chi phí (cost) là mục riêng của người ghi, bên kia không thấy.
 */
enum DealEntryKind: string
{
    case Deposit = 'deposit';
    case Cut = 'cut';
    case Payment = 'payment';
    case Cost = 'cost';

    public function isShared(): bool
    {
        return $this !== self::Cost;
    }
}
