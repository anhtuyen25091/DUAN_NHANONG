<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** 1 lượt người dùng báo "giá sai" (mỗi máy 1 lần cho 1 giá) */
#[Fillable(['price_report_id', 'device_id', 'reason'])]
class PriceReportFlag extends Model
{
    /**
     * @return BelongsTo<PriceReport, $this>
     */
    public function report(): BelongsTo
    {
        return $this->belongsTo(PriceReport::class, 'price_report_id');
    }
}
