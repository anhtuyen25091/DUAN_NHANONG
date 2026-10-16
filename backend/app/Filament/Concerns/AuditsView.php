<?php

namespace App\Filament\Concerns;

use App\Models\User;
use App\Support\AdminAudit;

/**
 * Trang xem chi tiết dữ liệu riêng: mở trang là ghi nhật ký (ai xem, của ai, lúc nào).
 * Trang dùng trait này khai báo auditSubject(): [người dùng, khu vực, mô tả bản ghi].
 */
trait AuditsView
{
    public function mount(int|string $record): void
    {
        parent::mount($record);
        [$subject, $area, $label] = $this->auditSubject();
        AdminAudit::viewed($subject, $area, $label);
    }

    /**
     * @return array{0: User|null, 1: string, 2: string}
     */
    abstract protected function auditSubject(): array;
}
