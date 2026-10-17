<?php

namespace App\Shops\Collect;

use App\Enums\CandidateStatus;
use App\Enums\ShopType;
use App\Models\Shop;
use App\Models\ShopCandidate;
use App\Shops\ShopClassifier;
use App\Support\PlaceSearch;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\DB;

/**
 * Xử lý điểm chờ: lấy tọa độ → tìm điểm trùng → chấm điểm tin cậy → đủ ngưỡng thì gộp vào bảng shops,
 * thiếu thì để admin duyệt (trang "Điểm bán thu thập").
 */
class CandidateProcessor
{
    public function __construct(private ShopGeocoder $geocoder, private ShopMatcher $matcher, private PlaceSearch $places) {}

    /**
     * @return 'published'|'pending'|'deferred'|'skipped'
     */
    public function process(ShopCandidate $candidate): string
    {
        if ($candidate->status !== CandidateStatus::Pending) {
            return 'skipped';
        }

        // Nguồn có tọa độ mà không ghi tỉnh (OSM): tra ngược tỉnh từ tọa độ
        if ($candidate->province_code === null && $candidate->lat !== null) {
            $candidate->province_code = $this->places->provinceAt($candidate->lat, (float) $candidate->lng);
        }

        if ($candidate->lat === null) {
            try {
                $location = $this->geocoder->locate($candidate->address, $candidate->province_code);
            } catch (ConnectionException|RequestException) {
                return 'deferred';
            }
            if ($location !== null) {
                $candidate->fill(['lat' => $location['lat'], 'lng' => $location['lng'], 'geo_precision' => $location['precision']]);
            }
        }

        $match = $this->matcher->find($candidate);
        $candidate->confidence = $this->confidence($candidate, $candidate->source_trust, $match);
        $candidate->shop_id = $match?->id;

        $reason = $this->blocker($candidate);
        if ($reason !== null || $candidate->confidence < (int) config('shops.publish_threshold', 70)) {
            $candidate->review_note = $reason ?? 'Chưa đủ tin cậy để tự hiện';
            $candidate->save();

            return 'pending';
        }

        $this->publish($candidate, $match);

        return 'published';
    }

    /**
     * Đưa điểm vào bảng shops (admin bấm "Đưa vào" cũng gọi hàm này): trùng điểm đã có thì bổ sung chỗ còn thiếu,
     * không thì tạo điểm mới. Điểm admin đã xác minh thì chỉ thêm loại, không sửa thông tin.
     */
    public function publish(ShopCandidate $candidate, ?Shop $match = null): Shop
    {
        $match ??= $candidate->shop_id !== null ? Shop::query()->find($candidate->shop_id) : $this->matcher->find($candidate);

        return DB::transaction(function () use ($candidate, $match): Shop {
            $shop = $match ?? new Shop([
                'source' => $candidate->source,
                'source_ref' => "{$candidate->source}:{$candidate->source_ref}",
                'is_verified' => false,
                'is_active' => true,
            ]);

            $types = collect($shop->types ?? [])->merge($candidate->types)->unique(fn (ShopType $t): string => $t->value)->values()->all();
            $shop->types = $types;

            if (! $shop->is_verified) {
                $shop->name = $shop->name ?: $candidate->name;
                $shop->phone ??= $candidate->phone;
                $shop->address ??= $candidate->address;
                $shop->province_code ??= $candidate->province_code;
                $shop->goods ??= $candidate->goods;
                // Tọa độ: lấy cái chính xác hơn
                if ($candidate->lat !== null && $this->rank($candidate->geo_precision) > $this->rank($shop->lat === null ? 'none' : $shop->geo_precision)) {
                    $shop->lat = $candidate->lat;
                    $shop->lng = $candidate->lng;
                    $shop->geo_precision = $candidate->geo_precision;
                }
            }
            $shop->save();
            $this->matcher->remember($shop);

            $candidate->fill(['shop_id' => $shop->id, 'status' => CandidateStatus::Published, 'review_note' => null])->save();

            return $shop;
        });
    }

    private function confidence(ShopCandidate $candidate, int $trust, ?Shop $match): int
    {
        $score = $trust;
        if ($candidate->phone !== null) {
            $score += 5;
        }
        $score += match ($candidate->geo_precision) {
            'exact' => 10,
            'place' => 5,
            'district' => 2,
            default => 0,
        };
        // Có ở nguồn khác (hoặc đã có trong danh sách điểm bán): đáng tin hơn
        $elsewhere = ShopCandidate::query()
            ->where('source', '!=', $candidate->source)
            ->where(fn ($q) => $q->when($candidate->phone !== null, fn ($q) => $q->orWhere('phone', $candidate->phone))
                ->when($match !== null, fn ($q) => $q->orWhere('shop_id', $match->id)))
            ->when($candidate->phone === null && $match === null, fn ($q) => $q->whereRaw('1 = 0'))
            ->exists();
        if ($elsewhere || $match?->is_verified) {
            $score += 20;
        }

        return min(100, $score);
    }

    /** Lý do bắt buộc admin xem, dù nguồn tin cậy */
    private function blocker(ShopCandidate $candidate): ?string
    {
        if ($candidate->types->isEmpty()) {
            return 'Không rõ loại điểm (thu mua / phân bón / BVTV)';
        }
        if ($candidate->province_code === null) {
            return 'Không rõ tỉnh';
        }
        if ($candidate->lat === null) {
            return 'Không có tọa độ';
        }

        return null;
    }

    private function rank(?string $precision): int
    {
        return match ($precision) {
            'exact', null => 4,
            'place' => 3,
            'district' => 2,
            'province' => 1,
            default => 0,
        };
    }

    /** Loại điểm đoán theo tên khi nguồn không ghi */
    public static function typesFor(CandidateData $data): array
    {
        return $data->types !== [] ? $data->types : ShopClassifier::classify($data->name);
    }
}
