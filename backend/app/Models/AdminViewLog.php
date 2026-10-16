<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * 1 lần admin xem / tải dữ liệu riêng của người dùng.
 */
class AdminViewLog extends Model
{
    public const UPDATED_AT = null;

    public const AREAS = ['ledger' => 'Sổ thu chi', 'deal' => 'Đơn mua bán', 'purchase' => 'Phiếu mua / bán', 'business' => 'Doanh nghiệp'];

    protected $guarded = [];

    protected function casts(): array
    {
        return ['created_at' => 'datetime'];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function admin(): BelongsTo
    {
        return $this->belongsTo(User::class, 'admin_id');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function subject(): BelongsTo
    {
        return $this->belongsTo(User::class, 'subject_user_id');
    }
}
