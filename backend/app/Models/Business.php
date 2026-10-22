<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

/**
 * Doanh nghiệp thu mua: 1 chủ + các lái con. Phiếu, khách, đơn chung lái tạo thì thuộc doanh nghiệp;
 * chủ thấy và thống kê tất cả, lái chỉ thấy của mình.
 */
#[Fillable(['name', 'phone', 'address'])]
class Business extends Model
{
    protected static function booted(): void
    {
        static::creating(function (Business $business): void {
            $business->uuid ??= (string) Str::uuid();
        });
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    /**
     * @return HasMany<BusinessMember, $this>
     */
    public function members(): HasMany
    {
        return $this->hasMany(BusinessMember::class);
    }

    /**
     * @return HasMany<BusinessAdvance, $this>
     */
    public function advances(): HasMany
    {
        return $this->hasMany(BusinessAdvance::class);
    }

    /**
     * @return HasMany<BusinessBuyPrice, $this>
     */
    public function buyPrices(): HasMany
    {
        return $this->hasMany(BusinessBuyPrice::class);
    }

    public function isOwner(User $user): bool
    {
        return $this->owner_id === $user->id;
    }
}
