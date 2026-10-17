<?php

namespace App\Models;

use App\Enums\CandidateStatus;
use App\Enums\ShopType;
use App\Support\Provinces;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Casts\AsEnumCollection;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * 1 điểm bán lấy được từ 1 nguồn, chờ gộp vào bảng shops.
 *
 * @property CandidateStatus $status
 */
#[Fillable(['source', 'source_ref', 'source_trust', 'source_url', 'name', 'types', 'address', 'province_code', 'phone', 'goods', 'lat', 'lng', 'geo_precision', 'raw', 'status', 'confidence', 'review_note', 'shop_id', 'last_seen_at'])]
class ShopCandidate extends Model
{
    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'types' => AsEnumCollection::of(ShopType::class),
            'raw' => 'array',
            'lat' => 'float',
            'lng' => 'float',
            'status' => CandidateStatus::class,
            'confidence' => 'integer',
            'source_trust' => 'integer',
            'last_seen_at' => 'datetime',
        ];
    }

    public function provinceName(): ?string
    {
        return Provinces::name($this->province_code);
    }

    /**
     * @return BelongsTo<Shop, $this>
     */
    public function shop(): BelongsTo
    {
        return $this->belongsTo(Shop::class);
    }
}
