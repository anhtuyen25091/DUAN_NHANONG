<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

/**
 * Chỉ số đo (độ ẩm đất, pH nước, mực nước...). min_valid/max_valid dùng để loại số đo vô lý (cảm biến hỏng, nhiễu).
 */
#[Fillable(['code', 'name', 'unit', 'group', 'min_valid', 'max_valid', 'decimals', 'sort'])]
class Metric extends Model
{
    public $timestamps = false;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'min_valid' => 'float',
            'max_valid' => 'float',
            'decimals' => 'integer',
            'sort' => 'integer',
        ];
    }

    /**
     * Danh mục ít đổi, mỗi lần nhận dữ liệu đều cần nên giữ trong bộ nhớ của tiến trình.
     * Cache chỉ giữ mảng thuộc tính: Laravel không cho unserialize model từ cache (cache.serializable_classes).
     *
     * @return array<string, Metric>
     */
    public static function byCode(): array
    {
        $rows = Cache::memo()->rememberForever('metrics.by-code', fn () => static::query()->get()->map->getAttributes()->all());

        return static::hydrate($rows)->keyBy('code')->all();
    }

    public static function flushCache(): void
    {
        Cache::memo()->forget('metrics.by-code');
    }

    protected static function booted(): void
    {
        static::saved(fn () => static::flushCache());
        static::deleted(fn () => static::flushCache());
    }

    public function isValid(float $value): bool
    {
        return $value >= $this->min_valid && $value <= $this->max_valid;
    }
}
