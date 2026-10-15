<?php

namespace App\Models;

use App\Enums\BuyerKind;
use App\Enums\BuyerStatus;
use App\Enums\ShopType;
use App\Support\Provinces;
use Database\Factories\BuyerFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Casts\AsEnumCollection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Hồ sơ điểm mua (doanh nghiệp / đại lý / thương lái / điểm bán lẻ) của 1 tài khoản.
 * Admin duyệt (status = approved) mới được đăng giá; is_verified = đã kiểm tra uy tín (hiện dấu ✓).
 */
#[Fillable(['user_id', 'name', 'kind', 'deals_in', 'phone', 'address', 'province_code', 'lat', 'lng', 'goods', 'status', 'is_verified', 'admin_note', 'approved_at', 'shop_id'])]
class Buyer extends Model
{
    /** @use HasFactory<BuyerFactory> */
    use HasFactory;

    protected function casts(): array
    {
        return [
            'kind' => BuyerKind::class,
            'deals_in' => AsEnumCollection::of(ShopType::class),
            'status' => BuyerStatus::class,
            'lat' => 'float',
            'lng' => 'float',
            'is_verified' => 'boolean',
            'approved_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return BelongsTo<Shop, $this>
     */
    public function shop(): BelongsTo
    {
        return $this->belongsTo(Shop::class);
    }

    /**
     * @return HasMany<PriceReport, $this>
     */
    public function reports(): HasMany
    {
        return $this->hasMany(PriceReport::class);
    }

    public function canPost(): bool
    {
        return $this->status === BuyerStatus::Approved;
    }

    public function provinceName(): ?string
    {
        return Provinces::name($this->province_code);
    }

    /**
     * Duyệt: được đăng giá, và tự tạo (hoặc cập nhật) 1 điểm bán để hiện trong "Điểm bán" / "Dịch vụ quanh đây".
     */
    public function approve(bool $verified = false): void
    {
        $this->update(['status' => BuyerStatus::Approved, 'approved_at' => $this->approved_at ?? now(), 'is_verified' => $verified || $this->is_verified]);
        $this->syncShop();
    }

    public function reject(?string $note = null): void
    {
        $this->update(['status' => BuyerStatus::Rejected, 'admin_note' => $note]);
        $this->shop?->update(['is_active' => false]);
    }

    public function suspend(?string $note = null): void
    {
        $this->update(['status' => BuyerStatus::Suspended, 'admin_note' => $note]);
        $this->shop?->update(['is_active' => false]);
    }

    /** Điểm bán đi kèm luôn khớp với hồ sơ (tên, địa chỉ, vị trí…) */
    public function syncShop(): void
    {
        $data = [
            'name' => $this->name,
            'types' => $this->deals_in,
            'address' => $this->address,
            'province_code' => $this->province_code,
            'lat' => $this->lat,
            'lng' => $this->lng,
            'phone' => $this->phone,
            'goods' => $this->goods,
            'source' => 'buyer',
            'source_ref' => 'buyer:'.$this->id,
            'is_verified' => $this->is_verified,
            'is_active' => $this->status === BuyerStatus::Approved,
        ];

        if ($this->shop) {
            $this->shop->update($data);
        } else {
            $this->update(['shop_id' => Shop::query()->updateOrCreate(['source_ref' => 'buyer:'.$this->id], $data)->id]);
        }
    }
}
