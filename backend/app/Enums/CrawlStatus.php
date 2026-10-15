<?php

namespace App\Enums;

use Filament\Support\Contracts\HasColor;
use Filament\Support\Contracts\HasLabel;

enum CrawlStatus: string implements HasColor, HasLabel
{
    /** Trích được giá */
    case Success = 'success';

    /** Tải được trang nhưng không trích được giá nào */
    case Empty = 'empty';

    /** Không có bài cho ngày này hoặc bị robots.txt chặn */
    case Skipped = 'skipped';

    case Failed = 'failed';

    public function getLabel(): string
    {
        return match ($this) {
            self::Success => 'Thành công',
            self::Empty => 'Không có giá',
            self::Skipped => 'Bỏ qua',
            self::Failed => 'Lỗi',
        };
    }

    public function getColor(): string
    {
        return match ($this) {
            self::Success => 'success',
            self::Empty => 'warning',
            self::Skipped => 'gray',
            self::Failed => 'danger',
        };
    }
}
