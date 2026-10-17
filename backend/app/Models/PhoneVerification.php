<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

/**
 * 1 lần xác minh số điện thoại bằng SMS ngược (xem migration create_phone_verifications_table).
 */
#[Fillable(['phone', 'code', 'purpose', 'status', 'verified_at', 'expires_at'])]
class PhoneVerification extends Model
{
    protected static function booted(): void
    {
        static::creating(function (PhoneVerification $v): void {
            $v->uuid ??= (string) Str::uuid();
        });
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return ['verified_at' => 'datetime', 'expires_at' => 'datetime'];
    }

    public function getRouteKeyName(): string
    {
        return 'uuid';
    }

    public function isExpired(): bool
    {
        return $this->expires_at->isPast();
    }
}
