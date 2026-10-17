<?php

namespace App\Shops\Collect;

use App\Models\Shop;
use App\Models\ShopCandidate;
use App\Support\Geo;
use Illuminate\Support\Collection;

/**
 * Tìm điểm bán đã có trùng với 1 điểm vừa thu thập (cùng điểm nhưng lấy từ nguồn khác / lần trước).
 */
class ShopMatcher
{
    /** @var array<string, Collection<int, Shop>> điểm bán theo tỉnh, nạp 1 lần cho cả lượt xử lý */
    private array $byProvince = [];

    public function find(ShopCandidate $candidate): ?Shop
    {
        $sameRef = Shop::query()->where('source_ref', "{$candidate->source}:{$candidate->source_ref}")->first();
        if ($sameRef !== null) {
            return $sameRef;
        }

        if ($candidate->phone !== null) {
            $byPhone = Shop::query()->where('phone', $candidate->phone)->first();
            if ($byPhone !== null) {
                return $byPhone;
            }
        }

        $key = ShopNormalizer::nameKey($candidate->name);
        $address = ShopNormalizer::addressKey($candidate->address);
        $best = null;
        $bestScore = 0.0;
        foreach ($this->shopsIn($candidate->province_code) as $shop) {
            if ($candidate->phone !== null && $shop->phone !== null) {
                // Cùng số (điểm cũ ghi số kiểu khác, vd "0912 345 678"): cùng điểm; khác số: 2 điểm khác nhau
                if (ShopNormalizer::phone($shop->phone) === $candidate->phone) {
                    return $shop;
                }

                continue;
            }
            $nameScore = ShopNormalizer::similarity($key, ShopNormalizer::nameKey($shop->name));
            if ($nameScore < 85) {
                continue;
            }
            $near = $this->near($candidate, $shop);
            $sameAddress = $address !== '' && ShopNormalizer::similarity($address, ShopNormalizer::addressKey($shop->address)) >= 80;
            // Tên giống hệt: chỉ cần không ở xa nhau; tên gần giống: phải gần nhau hoặc cùng địa chỉ
            $isMatch = $nameScore >= 99 ? ($near !== false || $sameAddress) : ($near === true || $sameAddress);
            if ($isMatch && $nameScore > $bestScore) {
                $best = $shop;
                $bestScore = $nameScore;
            }
        }

        return $best;
    }

    /** Sau khi thêm điểm mới: cho vào danh sách đang nạp để các điểm sau trong cùng lượt so khớp được */
    public function remember(Shop $shop): void
    {
        if (isset($this->byProvince[(string) $shop->province_code])) {
            $this->byProvince[(string) $shop->province_code]->push($shop);
        }
    }

    /**
     * true: gần nhau (≤ 300 m) · false: xa nhau (> 2 km) · null: không đủ tọa độ chính xác để nói
     */
    private function near(ShopCandidate $candidate, Shop $shop): ?bool
    {
        $precise = fn (?string $precision): bool => in_array($precision, ['exact', null], true);
        if ($candidate->lat === null || $shop->lat === null || ! $precise($candidate->geo_precision) || ! $precise($shop->geo_precision)) {
            return null;
        }
        $km = Geo::distanceKm($candidate->lat, $candidate->lng, $shop->lat, (float) $shop->lng);

        return $km <= 0.3 ? true : ($km > 2 ? false : null);
    }

    /**
     * @return Collection<int, Shop>
     */
    private function shopsIn(?string $province): Collection
    {
        return $this->byProvince[(string) $province] ??= Shop::query()
            ->where('province_code', $province)
            ->get(['id', 'name', 'phone', 'address', 'province_code', 'lat', 'lng', 'geo_precision', 'source_ref', 'is_verified']);
    }
}
