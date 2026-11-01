<?php

namespace App\Models;

use App\Enums\CommandStatus;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['actuator_id', 'action', 'minutes', 'source', 'user_id', 'rule_id', 'reason', 'status', 'message', 'expires_at', 'sent_at', 'done_at'])]
class ActuatorCommand extends Model
{
    public const ON = 'on';

    public const OFF = 'off';

    /** Bấm tay trong app / admin */
    public const SOURCE_MANUAL = 'manual';

    /** Luật tự động */
    public const SOURCE_RULE = 'rule';

    /** Lịch tưới */
    public const SOURCE_SCHEDULE = 'schedule';

    /** Khóa an toàn tự tắt (VD nước mặn) */
    public const SOURCE_SAFETY = 'safety';

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'status' => CommandStatus::class,
            'minutes' => 'integer',
            'expires_at' => 'datetime',
            'sent_at' => 'datetime',
            'done_at' => 'datetime',
        ];
    }

    /**
     * Dạng mạch đọc: {"id": 12, "channel": 1, "action": "on", "minutes": 30}
     *
     * @return array{id: int, channel: int, action: string, minutes: ?int}
     */
    public function forDevice(): array
    {
        return ['id' => $this->id, 'channel' => $this->actuator->channel, 'action' => $this->action, 'minutes' => $this->minutes];
    }

    /**
     * @return BelongsTo<Actuator, $this>
     */
    public function actuator(): BelongsTo
    {
        return $this->belongsTo(Actuator::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return BelongsTo<AutomationRule, $this>
     */
    public function rule(): BelongsTo
    {
        return $this->belongsTo(AutomationRule::class);
    }
}
