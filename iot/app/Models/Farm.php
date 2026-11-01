<?php

namespace App\Models;

use App\Jobs\SyncFarmRain;
use Database\Factories\FarmFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable(['user_id', 'name', 'province', 'lat', 'lng', 'rain_alerts'])]
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
        ];
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
