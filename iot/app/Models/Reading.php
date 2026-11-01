<?php

namespace App\Models;

use App\Enums\ReadingSource;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['device_id', 'metric_id', 'value', 'measured_at', 'received_at', 'source'])]
class Reading extends Model
{
    public $timestamps = false;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'value' => 'float',
            'measured_at' => 'datetime',
            'received_at' => 'datetime',
            'source' => ReadingSource::class,
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
     * @return BelongsTo<Metric, $this>
     */
    public function metric(): BelongsTo
    {
        return $this->belongsTo(Metric::class);
    }
}
