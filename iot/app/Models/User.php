<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Filament\Models\Contracts\FilamentUser;
use Filament\Panel;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasManyThrough;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

/**
 * Chủ trang trại. is_admin cố ý không nằm trong Fillable; cấp quyền bằng `php artisan admin:grant {email}`.
 */
#[Fillable(['name', 'email', 'password'])]
#[Hidden(['password', 'remember_token', 'nhanong_token'])]
class User extends Authenticatable implements FilamentUser
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_admin' => 'boolean',
            'nhanong_token' => 'encrypted',
            'premium_until' => 'date',
            'plan_checked_at' => 'datetime',
        ];
    }

    /**
     * @return HasMany<Farm, $this>
     */
    public function farms(): HasMany
    {
        return $this->hasMany(Farm::class);
    }

    /**
     * @return HasManyThrough<Device, Farm, $this>
     */
    public function devices(): HasManyThrough
    {
        return $this->hasManyThrough(Device::class, Farm::class);
    }

    /**
     * @return HasMany<PushToken, $this>
     */
    public function pushTokens(): HasMany
    {
        return $this->hasMany(PushToken::class);
    }

    /** Có gói trả phí của Nhà Nông còn hạn (đã nối tài khoản) */
    public function hasPremium(): bool
    {
        return $this->nhanong_tier === 'premium' && ($this->premium_until === null || $this->premium_until->endOfDay()->isFuture());
    }

    /** Số ngày lịch sử lượng mưa được xem */
    public function rainHistoryDays(): int
    {
        return $this->hasPremium() ? config('iot.rain_history.premium_days') : config('iot.rain_history.free_days');
    }

    /** Email, hoặc SĐT Nhà Nông khi đăng nhập bằng tài khoản Nhà Nông */
    public function contactLabel(): string
    {
        return $this->email ?? $this->nhanong_phone ?? '';
    }

    public function canAccessPanel(Panel $panel): bool
    {
        return (bool) $this->is_admin;
    }
}
