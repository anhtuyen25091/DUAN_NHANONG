<?php

namespace App\Models;

use App\Enums\ShopType;
use App\Support\Provinces;
use Database\Factories\ShopFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Casts\AsEnumCollection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Điểm thu mua nông sản / bán phân bón / bán thuốc BVTV.
 *
 * source: osm | import (danh sách của Sở, file CSV) | user (người dùng đề xuất, đã duyệt) | admin
 */
#[Fillable(['name', 'types', 'address', 'province_code', 'lat', 'lng', 'phone', 'goods', 'opening_hours', 'source', 'source_ref', 'is_verified', 'is_active'])]
class Shop extends Model
{
    /** @use HasFactory<ShopFactory> */
    use HasFactory;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'types' => AsEnumCollection::of(ShopType::class),
            'lat' => 'float',
            'lng' => 'float',
            'is_verified' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    public function provinceName(): ?string
    {
        return Provinces::name($this->province_code);
    }

    /**
     * @param  Builder<Shop>  $query
     */
    public function scopeActive(Builder $query): void
    {
        $query->where('is_active', true);
    }

    /**
     * @param  Builder<Shop>  $query
     */
    public function scopeOfType(Builder $query, ShopType $type): void
    {
        $query->whereJsonContains('types', $type->value);
    }

    /**
     * @return HasMany<ShopSubmission, $this>
     */
    public function submissions(): HasMany
    {
        return $this->hasMany(ShopSubmission::class);
    }
}
