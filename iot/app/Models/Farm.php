<?php

namespace App\Models;

use App\Jobs\SyncFarmRain;
use Database\Factories\FarmFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['user_id', 'name', 'province', 'lat', 'lng', 'rain_alerts', 'dry_alert_days'])]
class Farm extends Model
{
    /** @use HasFactory<FarmFactory> */
    use HasFactory;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'lat' => 'float',
            'lng' => 'float',
            'rain_alerts' => 'boolean',
            'raining_since' => 'datetime',
            'last_rain_at' => 'datetime',
            'rain_episode_mm' => 'float',
            'rain_alerted_at' => 'datetime',
            'dry_alert_days' => 'integer',
            'dry_alerted_at' => 'datetime',
        ];
    }

    /**
     * Trang trại người dùng làm chủ hoặc được chia sẻ.
     *
     * @param  Builder<Farm>  $query
     */
    public function scopeAccessibleBy(Builder $query, User $user): void
    {
        $query->where(fn (Builder $query) => $query
            ->where('farms.user_id', $user->id)
            ->orWhereIn('farms.id', FarmMember::query()->select('farm_id')->where('user_id', $user->id)));
    }

    public function hasLocation(): bool
    {
        return $this->lat !== null && $this->lng !== null;
    }

    protected static function booted(): void
    {
        // Vừa có / đổi vị trí: lấy lượng mưa 1 năm qua tại vị trí mới
        static::saved(function (Farm $farm) {
            if ($farm->hasLocation() && ($farm->wasRecentlyCreated || $farm->wasChanged(['lat', 'lng']))) {
                SyncFarmRain::dispatch($farm->id, config('iot.rain_history.premium_days'))->afterCommit();
            }
        });
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return HasMany<FarmMember, $this>
     */
    public function members(): HasMany
    {
        return $this->hasMany(FarmMember::class);
    }

    /**
     * Vai trò của người dùng với trang trại: owner / operator / viewer; null = không liên quan.
     */
    public function roleOf(User $user): ?string
    {
        if ($this->user_id === $user->id) {
            return 'owner';
        }

        return $this->members()->where('user_id', $user->id)->value('role');
    }

    /**
     * Điện thoại nhận thông báo của trang trại: chủ + mọi người được chia sẻ.
     *
     * @return Collection<int, PushToken>
     */
    public function recipientTokens(): Collection
    {
        return PushToken::query()
            ->where('user_id', $this->user_id)
            ->orWhereIn('user_id', $this->members()->select('user_id'))
            ->get();
    }

    /**
     * @return HasMany<Plot, $this>
     */
    public function plots(): HasMany
    {
        return $this->hasMany(Plot::class);
    }

    /**
     * @return HasMany<Device, $this>
     */
    public function devices(): HasMany
    {
        return $this->hasMany(Device::class);
    }
}
