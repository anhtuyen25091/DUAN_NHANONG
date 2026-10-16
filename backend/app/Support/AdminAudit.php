<?php

namespace App\Support;

use App\Models\AdminViewLog;
use App\Models\User;
use Illuminate\Support\Facades\Auth;

/**
 * Ghi lại mỗi lần admin xem chi tiết / tải giấy tờ của 1 người dùng.
 * Mở lại cùng 1 thứ trong 10 phút (tải lại trang, đổi tab) chỉ ghi 1 lần.
 */
final class AdminAudit
{
    public const DEDUPE_MINUTES = 10;

    public static function viewed(?User $subject, string $area, string $record, string $action = 'view'): void
    {
        $admin = Auth::user();
        if (! $admin instanceof User) {
            return;
        }

        $recent = AdminViewLog::query()
            ->where('admin_id', $admin->id)
            ->where('subject_user_id', $subject?->id)
            ->where('area', $area)
            ->where('record', $record)
            ->where('action', $action)
            ->where('created_at', '>=', now()->subMinutes(self::DEDUPE_MINUTES))
            ->exists();
        if ($recent) {
            return;
        }

        AdminViewLog::query()->create([
            'admin_id' => $admin->id,
            'subject_user_id' => $subject?->id,
            'area' => $area,
            'record' => mb_substr($record, 0, 200),
            'action' => $action,
            'created_at' => now(),
        ]);
    }
}
