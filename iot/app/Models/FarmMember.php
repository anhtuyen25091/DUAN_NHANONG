<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Người được chia sẻ trang trại. Vai trò: operator (xem + bật / tắt máy), viewer (chỉ xem).
 */
#[Fillable(['farm_id', 'user_id', 'role'])]
class FarmMember extends Model
{
    public const OPERATOR = 'operator';

    public const VIEWER = 'viewer';

    public const ROLES = [self::OPERATOR, self::VIEWER];

    /**
     * @return BelongsTo<Farm, $this>
     */
    public function farm(): BelongsTo
    {
        return $this->belongsTo(Farm::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
