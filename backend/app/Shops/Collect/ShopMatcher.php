<?php

namespace App\Shops\Collect;

use App\Models\Shop;
use App\Models\ShopCandidate;
use App\Support\Geo;
use App\Support\LegacyWards;
use Illuminate\Support\Collection;

/**
 * Tìm điểm bán đã có trùng với 1 điểm vừa thu thập (cùng điểm nhưng lấy từ nguồn khác / lần trước).
 */
class ShopMatcher
{
    /** @var array<string, Collection<int, Shop>> điểm bán theo tỉnh, nạp 1 lần cho cả lượt xử lý */
    private array $byProvince = [];

    private ?ShopGeocoder $geocoder = null;

    /** @var array<string, mixed> tên / địa chỉ đã chuẩn hóa (so mỗi điểm mới với cả nghìn điểm trong tỉnh) */
    private array $memo = [];

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
            $score = $this->nameScore($candidate->name, $shop->name);
            if ($score === null || ! $this->samePlace($candidate, $shop)) {
                continue;
            }
            if ($score > $bestScore) {
                $best = $shop;
                $bestScore = $score;
            }
        }

        return $best;
    }

    /**
     * Độ giống tên (null = khác tên). Danh sách của Sở ghi tên chủ hộ, trùng tên rất nhiều ("Nguyễn Thị Hương"),
     * nên so cả dấu: "Hương" khác "Hường" trừ khi cùng nơi; chỉ nhận lệch 1–2 ký tự do gõ sai.
     */
    private function nameScore(string $a, string $b): ?float
    {
        [$keyA, $lowerA] = $this->memo['name:'.$a] ??= [ShopNormalizer::nameKey($a), ShopNormalizer::nameCore($a)];
        [$keyB, $lowerB] = $this->memo['name:'.$b] ??= [ShopNormalizer::nameKey($b), ShopNormalizer::nameCore($b)];
        // Khác nhau quá nhiều về độ dài thì chắc chắn khác tên, khỏi so
        if (abs(strlen($lowerA) - strlen($lowerB)) > 6) {
            return null;
        }
        $sameKey = $keyA === $keyB;
        $accented = ShopNormalizer::similarity($lowerA, $lowerB);

        return ($sameKey && $accented >= 90) || $accented >= 95 ? $accented : null;
    }

    /**
     * Cùng nơi: cùng xã (+ cùng huyện nếu cả 2 ghi huyện) theo địa chỉ, hoặc tọa độ gần nhau
     * (≤ 300 m nếu cả 2 đúng nhà, ≤ 3 km nếu 1 bên đúng nhà, 1 bên tâm xã). Tâm huyện / tâm tỉnh không tính.
     */
    private function samePlace(ShopCandidate $candidate, Shop $shop): bool
    {
        [$communeA, $districtA] = $this->place((string) $candidate->address);
        [$communeB, $districtB] = $this->place((string) $shop->address);
        if ($communeA !== null && $communeB !== null) {
            return $communeA === $communeB && ($districtA === null || $districtB === null || $districtA === $districtB);
        }

        if ($candidate->lat === null || $shop->lat === null) {
            return false;
        }
        $rank = fn (?string $precision): int => match ($precision) {
            'exact', null => 2,
            'place' => 1,
            default => 0,
        };
        $ranks = [$rank($candidate->geo_precision), $rank($shop->geo_precision)];
        if (min($ranks) === 0) {
            return false;
        }
        $km = Geo::distanceKm($candidate->lat, (float) $candidate->lng, $shop->lat, (float) $shop->lng);

        return $km <= (min($ranks) === 2 ? 0.3 : 3);
    }

    /**
     * Xã, huyện (đã chuẩn hóa) trong địa chỉ
     *
     * @return array{0: string|null, 1: string|null}
     */
    private function place(string $address): array
    {
        return $this->memo['addr:'.$address] ??= array_map(
            fn (?string $name): ?string => $name === null ? null : LegacyWards::bare($name),
            ($this->geocoder ??= app(ShopGeocoder::class))->parse($address),
        );
    }

    /** Sau khi thêm điểm mới: cho vào danh sách đang nạp để các điểm sau trong cùng lượt so khớp được */
    public function remember(Shop $shop): void
    {
        if (isset($this->byProvince[(string) $shop->province_code])) {
            $this->byProvince[(string) $shop->province_code]->push($shop);
        }
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
