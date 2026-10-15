<?php

namespace App\Models;

use App\Enums\CrawlStatus;
use Database\Factories\CrawlLogFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\MassPrunable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string $target_date dạng Y-m-d
 */
#[Fillable(['price_source_id', 'target_date', 'url', 'status', 'items_count', 'message', 'raw_html'])]
class CrawlLog extends Model
{
    /** @use HasFactory<CrawlLogFactory> */
    use HasFactory, MassPrunable;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'status' => CrawlStatus::class,
        ];
    }

    /**
     * @return BelongsTo<PriceSource, $this>
     */
    public function priceSource(): BelongsTo
    {
        return $this->belongsTo(PriceSource::class);
    }

    /**
     * Xóa log cũ hơn 60 ngày (chạy bằng model:prune).
     *
     * @return Builder<CrawlLog>
     */
    public function prunable(): Builder
    {
        return static::where('created_at', '<', now()->subDays(60));
    }
}
