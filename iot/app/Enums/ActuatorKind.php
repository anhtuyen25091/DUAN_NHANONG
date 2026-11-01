<?php

namespace App\Enums;

use Filament\Support\Contracts\HasLabel;

enum ActuatorKind: string implements HasLabel
{
    case Pump = 'pump';
    case Aerator = 'aerator';
    case Valve = 'valve';
    case Mister = 'mister';
    case Light = 'light';
    case Other = 'other';

    public function getLabel(): string
    {
        return match ($this) {
            self::Pump => 'Máy bơm',
            self::Aerator => 'Quạt oxy / sục khí',
            self::Valve => 'Van / cống',
            self::Mister => 'Phun sương',
            self::Light => 'Đèn',
            self::Other => 'Khác',
        };
    }
}
