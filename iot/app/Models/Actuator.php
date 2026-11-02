<?php

namespace App\Models;

use App\Enums\ActuatorKind;
use App\Enums\CommandStatus;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * Máy bơm / quạt oxy / van... nối vào kênh relay số `channel` của mạch điều khiển `device`.
 * is_on là trạng thái mạch báo về gần nhất (không phải trạng thái mong muốn).
 * Khóa an toàn (block_*): số đo `block_metric` của cảm biến `block_device` (VD độ mặn nguồn nước) vượt `block_value`
 * thì không cho bật, đang chạy thì tự tắt (App\Services\Control\InterlockGuard).
 */
#[Fillable(['device_id', 'plot_id', 'name', 'kind', 'irrigation_mode', 'channel', 'max_minutes', 'block_device_id', 'block_metric_id', 'block_operator', 'block_value'])]
class Actuator extends Model
{
    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'kind' => ActuatorKind::class,
            'channel' => 'integer',
            'max_minutes' => 'integer',
            'is_on' => 'boolean',
            'state_changed_at' => 'datetime',
            'auto_off_at' => 'datetime',
            'block_value' => 'float',
        ];
    }

    /**
     * @return BelongsTo<Device, $this>
     */
    public function device(): BelongsTo
    {
        return $this->belongsTo(Device::class);
    }

    /**
     * @return BelongsTo<Plot, $this>
     */
    public function plot(): BelongsTo
    {
        return $this->belongsTo(Plot::class);
    }

    /** Tưới gốc / nhỏ giọt */
    public const ROOT = 'root';

    /** Phun mưa trên tán: rửa trôi thuốc vừa phun */
    public const CANOPY = 'canopy';

    /** Tưới lên lá / tán (phun sương mặc định là có): sau khi phun thuốc thì tạm dừng */
    public function wetsCanopy(): bool
    {
        return $this->irrigation_mode === self::CANOPY || ($this->irrigation_mode === null && $this->kind === ActuatorKind::Mister);
    }

    public function hasInterlock(): bool
    {
        return $this->block_device_id !== null && $this->block_metric_id !== null && $this->block_value !== null;
    }

    /** Số đo này có làm khóa an toàn chặn máy không */
    public function blockedBy(float $value): bool
    {
        return $this->block_operator === 'below' ? $value < $this->block_value : $value > $this->block_value;
    }

    /**
     * @return BelongsTo<Device, $this>
     */
    public function blockDevice(): BelongsTo
    {
        return $this->belongsTo(Device::class, 'block_device_id');
    }

    /**
     * @return BelongsTo<Metric, $this>
     */
    public function blockMetric(): BelongsTo
    {
        return $this->belongsTo(Metric::class, 'block_metric_id');
    }

    /**
     * @return HasMany<ActuatorSchedule, $this>
     */
    public function schedules(): HasMany
    {
        return $this->hasMany(ActuatorSchedule::class);
    }

    /**
     * @return HasMany<ActuatorCommand, $this>
     */
    public function commands(): HasMany
    {
        return $this->hasMany(ActuatorCommand::class);
    }

    /**
     * Lệnh đang chờ mạch làm (chỉ có tối đa 1: lệnh mới thay lệnh cũ)
     *
     * @return HasOne<ActuatorCommand, $this>
     */
    public function openCommand(): HasOne
    {
        return $this->hasOne(ActuatorCommand::class)->ofMany(['id' => 'max'], fn ($query) => $query->whereIn('status', [CommandStatus::Pending, CommandStatus::Sent]));
    }
}
