<?php

namespace App\Enums;

use Filament\Support\Contracts\HasLabel;

enum NameKind: string implements HasLabel
{
    case Product = 'product';
    case Region = 'region';

    public function getLabel(): string
    {
        return match ($this) {
            self::Product => 'Mặt hàng',
            self::Region => 'Khu vực',
        };
    }
}
