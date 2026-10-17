<?php

namespace App\Shops\Collect;

use App\Support\Geo;
use App\Support\Provinces;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;

/**
 * Lấy tọa độ cho địa chỉ điểm bán qua Photon (OpenStreetMap, miễn phí, config nhanong.geocoder.url).
 * Chỉ nhận kết quả nằm đúng tỉnh của điểm bán. Không tìm được thì lấy tâm tỉnh, đánh dấu "vị trí gần đúng".
 * Sau này đổi sang VietMap / Goong (đọc địa chỉ Việt Nam tốt hơn) chỉ cần thay class này.
 */
class ShopGeocoder
{
    private float $lastCallAt = 0;

    /**
     * @return array{lat: float, lng: float, precision: string}|null
     *
     * @throws ConnectionException|RequestException dịch vụ lỗi: không lấy tâm tỉnh, để lần xử lý sau thử lại
     */
    public function locate(?string $address, ?string $province): ?array
    {
        $address = trim((string) $address);
        if ($address !== '') {
            foreach ($this->queries($address, $province) as $query) {
                $found = $this->search($query, $province);
                if ($found !== null) {
                    return $found;
                }
            }
        }

        $center = Geo::provinceCenter($province);

        return $center === null ? null : ['lat' => $center[0], 'lng' => $center[1], 'precision' => 'province'];
    }

    /**
     * Thử địa chỉ đầy đủ trước, rồi bỏ dần phần đầu (số nhà, ấp/thôn) để ít nhất ra được xã.
     *
     * @return list<string>
     */
    private function queries(string $address, ?string $province): array
    {
        $provinceName = Provinces::name($province);
        $parts = array_values(array_filter(array_map('trim', explode(',', $address))));
        $queries = [];
        for ($i = 0; $i < count($parts) && count($queries) < 3; $i++) {
            $tail = implode(', ', array_slice($parts, $i));
            if ($provinceName !== null && ! str_contains(mb_strtolower($tail), mb_strtolower($provinceName))) {
                $tail .= ', '.$provinceName;
            }
            $queries[] = $tail;
        }

        return array_values(array_unique($queries));
    }

    /**
     * @return array{lat: float, lng: float, precision: string}|null
     */
    private function search(string $query, ?string $province): ?array
    {
        $key = 'shop-geo:'.md5(mb_strtolower($query).'|'.$province);
        $cached = Cache::get($key);
        if (is_array($cached)) {
            return $cached['hit'] ?? null;
        }

        // Dịch vụ miễn phí: tối đa ~1 lần / giây
        $wait = (int) config('shops.geocode_delay_ms', 1100) - (int) ((microtime(true) - $this->lastCallAt) * 1000);
        if ($wait > 0) {
            Sleep::for($wait)->milliseconds();
        }
        $this->lastCallAt = microtime(true);

        $center = Geo::provinceCenter($province);
        $features = Http::withUserAgent(config('crawler.user_agent'))
            ->timeout(10)
            ->retry([2000, 5000], 0, fn ($e): bool => $e instanceof ConnectionException || ($e instanceof RequestException && ($e->response->serverError() || $e->response->status() === 429)))
            ->get(config('nhanong.geocoder.url'), array_filter([
                'q' => $query,
                'limit' => 10,
                'lat' => $center[0] ?? null,
                'lon' => $center[1] ?? null,
            ], fn ($value): bool => $value !== null))
            ->throw()
            ->json('features', []);

        $hit = null;
        foreach ((array) $features as $feature) {
            $props = (array) ($feature['properties'] ?? []);
            if (($props['countrycode'] ?? null) !== 'VN') {
                continue;
            }
            $foundProvince = Provinces::detect($props['state'] ?? null) ?? Provinces::detect($props['city'] ?? null);
            if ($province !== null && $foundProvince !== $province) {
                continue;
            }
            [$lng, $lat] = array_map('floatval', (array) ($feature['geometry']['coordinates'] ?? [0, 0])) + [0, 0];
            // Ra đúng nhà / đường / cửa hàng: exact; ra xã, thôn: place. Ra cả tỉnh thì không tính (tự lấy tâm tỉnh sau).
            $type = (string) ($props['type'] ?? '');
            if (in_array($type, ['state', 'country'], true)) {
                continue;
            }
            $precision = in_array($props['osm_key'] ?? null, ['place', 'boundary'], true) ? 'place' : 'exact';
            $hit = ['lat' => round($lat, 7), 'lng' => round($lng, 7), 'precision' => $precision];
            break;
        }

        Cache::put($key, ['hit' => $hit], now()->addDays(90));

        return $hit;
    }
}
