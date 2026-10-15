<?php

namespace App\Enums;

use Filament\Support\Contracts\HasColor;
use Filament\Support\Contracts\HasLabel;

/** Giá điểm mua đăng: hiện ngay, giá lạ thì chờ duyệt */
enum ReportStatus: string implements HasColor, HasLabel
{
    case Published = 'published';
    case NeedsReview = 'needs_review';
    case Rejected = 'rejected';

    public function getLabel(): string
    {
        return match ($this) {
            self::Published => 'Đang hiện',
            self::NeedsReview => 'Chờ duyệt',
            self::Rejected => 'Đã gỡ',
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
