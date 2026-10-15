<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['user_id', 'tbl', 'uuid', 'data', 'client_updated_at', 'is_deleted', 'version'])]
class LedgerRecord extends Model
{
    /**
     * Các bảng của sổ thu chi được phép đồng bộ (giống tên bảng trên máy).
     * Thêm bảng mới cho chế độ Nâng cao thì khai báo ở đây.
     */
    public const TABLES = [
        'gardens', 'categories', 'transactions',
        'seasons', 'supplies', 'supply_usages', 'debts', 'debt_payments', 'harvest_contracts', 'harvest_cuts',
        'custom_fields', 'templates', 'harvests', 'workers', 'work_logs',
    ];

    protected function casts(): array
    {
        return [
            'data' => 'array',
            'is_deleted' => 'boolean',
            'version' => 'integer',
        ];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
