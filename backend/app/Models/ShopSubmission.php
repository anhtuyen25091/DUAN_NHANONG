<?php

namespace App\Models;

use App\Enums\SubmissionStatus;
use Database\Factories\ShopSubmissionFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Người dùng đề xuất điểm mới (shop_id null) hoặc báo sửa thông tin một điểm (shop_id có giá trị).
 * data giữ các trường giống Shop: name, types, address, province_code, phone, goods, lat, lng.
 */
#[Fillable(['device_id', 'shop_id', 'data', 'note', 'status', 'reviewed_at'])]
class ShopSubmission extends Model
{
    /** @use HasFactory<ShopSubmissionFactory> */
    use HasFactory;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'data' => 'array',
            'status' => SubmissionStatus::class,
            'reviewed_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<Shop, $this>
     */
    public function shop(): BelongsTo
    {
        return $this->belongsTo(Shop::class);
    }

    /**
     * @return BelongsTo<Device, $this>
     */
    public function device(): BelongsTo
    {
        return $this->belongsTo(Device::class);
    }

    /**
     * Duyệt: tạo điểm mới hoặc cập nhật điểm cũ theo dữ liệu đề xuất.
     */
    public function approve(): Shop
    {
        $data = array_intersect_key($this->data, array_flip(['name', 'types', 'address', 'province_code', 'phone', 'goods', 'lat', 'lng', 'opening_hours']));
        $data = array_filter($data, fn ($value): bool => $value !== null && $value !== '' && $value !== []);

        $shop = $this->shop ?? new Shop(['source' => 'user', 'is_verified' => true]);
        $shop->fill($data)->save();

        $this->update(['shop_id' => $shop->id, 'status' => SubmissionStatus::Approved, 'reviewed_at' => now()]);

        return $shop;
    }

    public function reject(): void
    {
        $this->update(['status' => SubmissionStatus::Rejected, 'reviewed_at' => now()]);
    }
}
