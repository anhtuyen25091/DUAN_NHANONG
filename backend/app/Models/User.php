<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use App\Support\Provinces;
use Database\Factories\UserFactory;
use Filament\Models\Contracts\FilamentUser;
use Filament\Panel;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

#[Fillable(['name', 'email', 'phone', 'password'])]
#[Hidden(['password', 'remember_token'])]
/**
 * is_admin cố ý không nằm trong Fillable; cấp quyền bằng lệnh `php artisan admin:grant {email}`.
 */
class User extends Authenticatable implements FilamentUser
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_admin' => 'boolean',
            'ledger_version' => 'integer',
            'premium_until' => 'datetime',
            'home_lat' => 'float',
            'home_lng' => 'float',
            'home_radius' => 'integer',
        ];
    }

    /**
     * @return HasMany<LedgerRecord, $this>
     */
    /**
     * Hồ sơ điểm mua (nếu tài khoản đăng ký làm điểm mua đăng giá)
     *
     * @return HasOne<Buyer, $this>
     */
    public function buyer(): HasOne
    {
        return $this->hasOne(Buyer::class);
    }

    /**
     * Thuộc doanh nghiệp nào (chủ hoặc lái con); mỗi tài khoản tối đa 1 doanh nghiệp
     *
     * @return HasOne<BusinessMember, $this>
     */
    public function membership(): HasOne
    {
        return $this->hasOne(BusinessMember::class);
    }

    /** Doanh nghiệp đang tham gia và còn dùng được (không bị khóa); null = làm riêng */
    public function activeMembership(): ?BusinessMember
    {
        $membership = $this->membership()->with('business')->first();

        return $membership?->isActive() ? $membership : null;
    }

    /**
     * Khu vực của tôi (để gợi ý giá + dịch vụ quanh đó); null nếu chưa chọn.
     *
     * @return array{province: string, province_name: ?string, lat: float, lng: float, label: ?string, radius: int}|null
     */
    public function homeLocation(): ?array
    {
        if ($this->home_province === null || $this->home_lat === null) {
            return null;
        }

        return [
            'province' => $this->home_province,
            'province_name' => Provinces::name($this->home_province),
            'lat' => $this->home_lat,
            'lng' => $this->home_lng,
            'label' => $this->home_label,
            'radius' => $this->home_radius ?? 30,
        ];
    }

    public function ledgerRecords(): HasMany
    {
        return $this->hasMany(LedgerRecord::class);
    }

    /**
     * "+84 912 345 678", "84912345678" -> "0912345678"; sai định dạng trả null.
     */
    public static function normalizePhone(?string $phone): ?string
    {
        $digits = preg_replace('/\D/', '', (string) $phone);
        if (str_starts_with($digits, '84') && strlen($digits) === 11) {
            $digits = '0'.substr($digits, 2);
        }

        return preg_match('/^0[1-9]\d{8}$/', $digits) ? $digits : null;
    }

    /** Gói xem toàn bộ lịch sử giá còn hạn */
    public function hasPremium(): bool
    {
        return $this->premium_until !== null && $this->premium_until->isFuture();
    }

    /**
     * Kích hoạt / gia hạn gói: cộng thêm số tháng vào hạn hiện tại (hoặc từ hôm nay nếu đã hết hạn).
     */
    public function extendPremium(int $months): void
    {
        $start = $this->hasPremium() ? $this->premium_until : now();
        $this->forceFill(['premium_until' => $start->copy()->addMonthsNoOverflow($months)->endOfDay()])->save();
    }

    public function canAccessPanel(Panel $panel): bool
    {
        return (bool) $this->is_admin;
    }
}
