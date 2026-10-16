<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

/**
 * Tiền chủ ứng cho lái (advance) hoặc lái nộp lại cho chủ (return).
 */
class BusinessAdvance extends Model
{
    use SoftDeletes;

    public const ADVANCE = 'advance';

    public const RETURN = 'return';

    protected $guarded = [];

    protected function casts(): array
    {
        return ['date' => 'date', 'amount' => 'integer'];
    }

    protected static function booted(): void
    {
        static::creating(function (BusinessAdvance $advance): void {
            $advance->uuid ??= (string) Str::uuid();
        });
    }

    public function getRouteKeyName(): string
    {
        return 'uuid';
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function member(): BelongsTo
    {
        return $this->belongsTo(User::class, 'member_id');
    }
}
