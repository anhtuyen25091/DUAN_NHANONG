<?php

namespace App\Enums;

use Filament\Support\Contracts\HasColor;
use Filament\Support\Contracts\HasLabel;

enum PriceStatus: string implements HasColor, HasLabel
{
    case Published = 'published';
    case NeedsReview = 'needs_review';
    case Rejected = 'rejected';

    public function getLabel(): string
    {
        return match ($this) {
            self::Published => 'Đã đăng',
            self::NeedsReview => 'Cần duyệt',
            self::Rejected => 'Đã loại',
        };
    }

    public function getColor(): string
    {
        return match ($this) {
            self::Published => 'success',
            self::NeedsReview => 'warning',
            self::Rejected => 'danger',
        };
    }
}
