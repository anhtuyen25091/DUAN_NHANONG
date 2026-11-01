<?php

namespace App\Enums;

use Filament\Support\Contracts\HasLabel;

enum AlertDirection: string implements HasLabel
{
    case Below = 'below';
    case Above = 'above';

    public function getLabel(): string
    {
        return match ($this) {
            self::Below => 'Thấp hơn ngưỡng',
            self::Above => 'Cao hơn ngưỡng',
        };
    }
}
