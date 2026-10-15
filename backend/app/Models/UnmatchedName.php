<?php

namespace App\Models;

use App\Enums\NameKind;
use Database\Factories\UnmatchedNameFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tên mặt hàng/khu vực gặp trong bảng giá nhưng chưa khớp alias nào, chờ admin xử lý.
 */
#[Fillable(['price_source_id', 'kind', 'name', 'normalized', 'sample_url', 'seen_count', 'last_seen_at', 'resolved'])]
class UnmatchedName extends Model
{
    /** @use HasFactory<UnmatchedNameFactory> */
    use HasFactory;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'kind' => NameKind::class,
            'last_seen_at' => 'datetime',
            'resolved' => 'boolean',
        ];
    }

    /**
     * @return BelongsTo<PriceSource, $this>
     */
    public function priceSource(): BelongsTo
    {
        return $this->belongsTo(PriceSource::class);
    }
}
