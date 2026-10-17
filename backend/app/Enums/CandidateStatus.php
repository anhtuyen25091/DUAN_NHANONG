<?php

namespace App\Enums;

use Filament\Support\Contracts\HasColor;
use Filament\Support\Contracts\HasLabel;

/** Điểm bán thu thập được: chờ duyệt → đã đưa vào danh sách điểm bán / bỏ */
enum CandidateStatus: string implements HasColor, HasLabel
{
    case Pending = 'pending';
    case Published = 'published';
    case Rejected = 'rejected';

    public function getLabel(): string
    {
        return match ($this) {
            self::Pending => 'Chờ duyệt',
            self::Published => 'Đã đưa vào',
            self::Rejected => 'Đã bỏ',
        };
    }

    public function getColor(): string
    {
        return match ($this) {
            self::Pending => 'warning',
            self::Published => 'success',
            self::Rejected => 'danger',
        };
    }
}
