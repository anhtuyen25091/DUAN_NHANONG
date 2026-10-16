<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * 1 tài khoản trong doanh nghiệp: chủ (owner) hoặc lái con (buyer), nhóm, đang dùng / bị khóa.
 */
class BusinessMember extends Model
{
    public const OWNER = 'owner';

    public const BUYER = 'buyer';

    public const ACTIVE = 'active';

    public const LOCKED = 'locked';

    protected $guarded = [];

    protected function casts(): array
    {
        return ['created_by_owner' => 'boolean'];
    }

    /**
     * @return BelongsTo<Business, $this>
     */
    public function business(): BelongsTo
    {
        return $this->belongsTo(Business::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isActive(): bool
    {
        return $this->status === self::ACTIVE;
    }
}
