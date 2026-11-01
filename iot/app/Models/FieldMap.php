<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tên trường trong dữ liệu đã giải mã của 1 loại thiết bị LoRaWAN -> chỉ số. value lưu = giá trị gốc × scale.
 */
#[Fillable(['profile', 'field', 'metric_id', 'scale'])]
class FieldMap extends Model
{
    public $timestamps = false;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'scale' => 'float',
        ];
    }

    /**
     * @return BelongsTo<Metric, $this>
     */
    public function metric(): BelongsTo
    {
        return $this->belongsTo(Metric::class);
    }
}
