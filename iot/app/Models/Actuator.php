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
 */
#[Fillable(['device_id', 'plot_id', 'name', 'kind', 'channel', 'max_minutes'])]
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
