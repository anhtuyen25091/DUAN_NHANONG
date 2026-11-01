<?php

namespace App\Models;

use App\Enums\DeviceKind;
use Database\Factories\DeviceFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

/**
 * Thiết bị gửi số đo. ESP32 xác thực bằng khóa (Authorization: Bearer), LoRaWAN nhận diện qua dev_eui.
 * uid là mã công khai in trên thiết bị, dùng trong topic MQTT và file dữ liệu điện thoại chuyển tiếp.
 */
#[Fillable(['farm_id', 'plot_id', 'name', 'kind', 'profile', 'dev_eui', 'firmware'])]
#[Hidden(['api_key', 'api_key_hash', 'downlink'])]
class Device extends Model
{
    /** @use HasFactory<DeviceFactory> */
    use HasFactory;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'kind' => DeviceKind::class,
            'api_key' => 'encrypted',
            'downlink' => 'encrypted:array',
            'last_seen_at' => 'datetime',
            'offline_notified_at' => 'datetime',
            'low_battery_notified_at' => 'datetime',
            'battery' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        static::creating(function (Device $device) {
            $device->uid ??= static::newUid();
        });
        static::saving(function (Device $device) {
            $device->dev_eui = $device->dev_eui ? strtolower($device->dev_eui) : null;
        });
    }

    /** Mã ngắn, dễ đọc trên nhãn dán: ND + 8 ký tự (bỏ chữ dễ nhầm O/0, I/1) */
    public static function newUid(): string
    {
        do {
            $uid = 'ND'.collect(range(1, 8))->map(fn () => '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'[random_int(0, 31)])->implode('');
        } while (static::query()->where('uid', $uid)->exists());

        return $uid;
    }

    public static function findByKey(string $key): ?Device
    {
        return $key === '' ? null : static::query()->where('api_key_hash', hash('sha256', $key))->first();
    }

    /**
     * Tạo khóa mới (khóa cũ hết hiệu lực). Trả về khóa dạng rõ, chỉ hiện 1 lần.
     */
    public function rotateKey(): string
    {
        $key = 'ndk_'.Str::random(40);
        $this->forceFill(['api_key' => $key, 'api_key_hash' => hash('sha256', $key)])->save();

        return $key;
    }

    /** Chữ ký HMAC-SHA256 của file dữ liệu, để máy chủ biết file do đúng thiết bị này tạo ra */
    public function sign(string $payload): string
    {
        return hash_hmac('sha256', $payload, (string) $this->api_key);
    }

    public function isOnline(): bool
    {
        return $this->last_seen_at !== null && $this->last_seen_at->gt(now()->subHours(config('iot.offline_after_hours')));
    }

    /**
     * @return BelongsTo<Farm, $this>
     */
    public function farm(): BelongsTo
    {
        return $this->belongsTo(Farm::class);
    }

    /**
     * @return BelongsTo<Plot, $this>
     */
    public function plot(): BelongsTo
    {
        return $this->belongsTo(Plot::class);
    }

    /**
     * @return HasMany<Reading, $this>
     */
    public function readings(): HasMany
    {
        return $this->hasMany(Reading::class);
    }

    /**
     * @return HasMany<Alert, $this>
     */
    public function alerts(): HasMany
    {
        return $this->hasMany(Alert::class);
    }

    /**
     * @return HasMany<Actuator, $this>
     */
    public function actuators(): HasMany
    {
        return $this->hasMany(Actuator::class);
    }
}
