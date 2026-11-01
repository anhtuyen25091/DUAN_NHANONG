<?php

namespace App\Enums;

use Filament\Support\Contracts\HasLabel;

enum PlotType: string implements HasLabel
{
    case Field = 'field';
    case Garden = 'garden';
    case Pond = 'pond';
    case Greenhouse = 'greenhouse';
    case Other = 'other';

    public function getLabel(): string
    {
        return match ($this) {
            self::Field => 'Ruộng',
            self::Garden => 'Vườn',
            self::Pond => 'Ao nuôi',
            self::Greenhouse => 'Nhà màng',
            self::Other => 'Khác',
        };
    }
}
