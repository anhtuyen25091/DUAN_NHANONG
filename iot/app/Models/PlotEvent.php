<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * 1 việc làm vườn trên 1 lô (phun thuốc, bón phân, tưới...). Đã làm (planned = false) thì có hiệu lực:
 * không vào lô tới done_at + reentry_hours, cách ly thu hoạch tới ngày làm + withholding_days,
 * tạm dừng tưới trên tán tới done_at + rain_free_hours.
 */
#[Fillable(['uuid', 'plot_id', 'user_id', 'kind', 'title', 'quantity', 'unit', 'target', 'withholding_days', 'reentry_hours', 'rain_free_hours', 'worker', 'note', 'planned', 'done_at', 'source', 'actuator_id', 'minutes'])]
class PlotEvent extends Model
{
    use SoftDeletes;

    public const SPRAY = 'spray';

    public const FERTILIZE = 'fertilize';

    public const WATER = 'water';

    public const PRUNE = 'prune';

    public const OTHER = 'other';

    public const KINDS = [self::SPRAY, self::FERTILIZE, self::WATER, self::PRUNE, self::OTHER];

    /** Giống FARM_LOG_KIND_LABELS ở packages/shared/src/farmlog.ts */
    public const LABELS = [
        self::SPRAY => '🧴 Phun thuốc',
        self::FERTILIZE => '🌱 Bón phân',
        self::WATER => '💧 Tưới nước',
        self::PRUNE => '✂️ Tỉa cành, làm cỏ',
        self::OTHER => '📝 Việc khác',
    ];

    public const SOURCE_MANUAL = 'manual';

    public const SOURCE_LEDGER = 'ledger';

    public const SOURCE_ACTUATOR = 'actuator';

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'quantity' => 'float',
            'withholding_days' => 'integer',
            'reentry_hours' => 'integer',
            'rain_free_hours' => 'integer',
            'minutes' => 'integer',
            'planned' => 'boolean',
            'done_at' => 'immutable_datetime',
            'reminded_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<Plot, $this>
     */
    public function plot(): BelongsTo
    {
        return $this->belongsTo(Plot::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return BelongsTo<Actuator, $this>
     */
    public function actuator(): BelongsTo
    {
        return $this->belongsTo(Actuator::class);
    }

    /** @param  Builder<self>  $query */
    public function scopeDone(Builder $query): void
    {
        $query->where('planned', false)->where('done_at', '<=', now());
    }

    /** Hết giờ cấm vào lô (null = không có) */
    public function noEntryUntil(): ?CarbonImmutable
    {
        return $this->reentry_hours ? $this->done_at->addHours($this->reentry_hours) : null;
    }

    /** Ngày đầu tiên được thu hoạch (giờ Việt Nam), giống withholdingOn ở thư viện chung */
    public function harvestFrom(): ?CarbonImmutable
    {
        return $this->withholding_days ? $this->done_at->setTimezone('Asia/Ho_Chi_Minh')->startOfDay()->addDays($this->withholding_days) : null;
    }

    /** Thuốc còn trên lá: tạm dừng tưới trên tán tới lúc này */
    public function canopyPauseUntil(): ?CarbonImmutable
    {
        if ($this->kind !== self::SPRAY) {
            return null;
        }

        return $this->done_at->addHours($this->rain_free_hours ?? (int) config('iot.farm_work.spray_rain_free_hours'));
    }
}
