<?php

namespace App\Enums;

use Filament\Support\Contracts\HasLabel;

enum AlertCondition: string implements HasLabel
{
    /** Báo mỗi khi có giá mới khác lần trước */
    case Change = 'change';

    /** Báo khi giá lên tới (hoặc vượt) ngưỡng */
    case Above = 'above';

    /** Báo khi giá xuống tới (hoặc dưới) ngưỡng */
    case Below = 'below';

    public function getLabel(): string
    {
        return match ($this) {
            self::Change => 'Khi giá thay đổi',
            self::Above => 'Khi giá lên tới',
            self::Below => 'Khi giá xuống tới',
        };
    }
}
