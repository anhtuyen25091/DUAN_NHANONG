<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Lịch tưới: "5:30, bơm 40 phút, mỗi 20 ngày, chỉ tháng 12 → 4, bỏ lượt nếu 24 giờ qua mưa ≥ 10 mm".
 * next_run_on: ngày chạy kế tiếp (chạy xong / bỏ lượt thì cộng every_days).
 */
#[Fillable(['actuator_id', 'start_time', 'minutes', 'every_days', 'months', 'skip_rain_mm', 'note', 'enabled', 'next_run_on'])]
class ActuatorSchedule extends Model
{
    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'minutes' => 'integer',
            'every_days' => 'integer',
            'skip_rain_mm' => 'float',
            'enabled' => 'boolean',
            'next_run_on' => 'date',
            'last_run_at' => 'datetime',
        ];
    }

    /**
     * Tháng luôn lưu dạng số (ô chọn tháng trên trang quản trị gửi chuỗi "12"); mảng rỗng = cả năm.
     *
     * @return Attribute<array<int, int>|null, array<int, int|string>|null>
     */
    protected function months(): Attribute
    {
        return Attribute::make(
            get: function (?string $value): ?array {
                $months = array_map('intval', json_decode((string) $value, true) ?: []);

                return $months === [] ? null : $months;
            },
            set: fn (?array $value) => empty($value) ? null : json_encode(array_values(array_map('intval', $value))),
        );
    }

    /** "05:30:00" (MySQL) / "05:30" -> "05:30" */
    public function startsAt(): string
    {
        return substr((string) $this->start_time, 0, 5);
    }

    public function inSeason(int $month): bool
    {
        return empty($this->months) || in_array($month, $this->months, true);
    }

    /**
     * @return BelongsTo<Actuator, $this>
     */
    public function actuator(): BelongsTo
    {
        return $this->belongsTo(Actuator::class);
    }
}
