<?php

namespace App\Enums;

use Filament\Support\Contracts\HasColor;
use Filament\Support\Contracts\HasLabel;

enum CommandStatus: string implements HasColor, HasLabel
{
    // Chờ mạch lấy
    case Pending = 'pending';
    // Mạch đã lấy, chờ báo kết quả
    case Sent = 'sent';
    case Done = 'done';
    case Failed = 'failed';
    // Quá hạn mà mạch chưa lấy (mất kết nối): không làm nữa
    case Expired = 'expired';
    // Lệnh mới hơn cho cùng thiết bị thay thế
    case Replaced = 'replaced';

    public function getLabel(): string
    {
        return match ($this) {
            self::Pending => 'Chờ gửi',
            self::Sent => 'Đã gửi',
            self::Done => 'Đã làm',
            self::Failed => 'Lỗi',
            self::Expired => 'Quá hạn',
            self::Replaced => 'Bị thay',
        };
    }

    public function getColor(): string
    {
        return match ($this) {
            self::Done => 'success',
            self::Failed, self::Expired => 'danger',
            self::Replaced => 'gray',
            default => 'warning',
        };
    }

    public function isOpen(): bool
    {
        return $this === self::Pending || $this === self::Sent;
    }
}
