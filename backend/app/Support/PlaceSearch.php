<?php

namespace App\Support;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/**
 * Tìm địa danh ở Việt Nam (xã / phường / thôn / huyện cũ) qua Photon (OpenStreetMap) để lấy tọa độ.
 * Chỉ nhận địa danh hành chính và khu dân cư (bỏ cửa hàng, sông hồ, đường); tỉnh đang chọn xếp trước.
 * Kết quả lưu cache 30 ngày theo (từ khóa, tỉnh) để không gọi lại dịch vụ ngoài.
 */
class PlaceSearch
{
    public const MAX_RESULTS = 8;

    /** Loại đối tượng OSM nhận làm "chỗ ở" */
    private const KINDS = ['place', 'boundary'];

    /**
     * Trả null khi dịch vụ tìm địa danh đang lỗi (khác với danh sách rỗng = không thấy).
     *
     * @return list<array{name: string, detail: string|null, province: string|null, province_name: string|null, lat: float, lng: float}>|null
     */
    public function search(string $query, ?string $province = null): ?array
    {
        $query = trim((string) preg_replace('/\s+/', ' ', $query));
        $key = 'places:'.md5(mb_strtolower($query).'|'.$province);

        $cached = Cache::get($key);
        if (is_array($cached)) {
            return $cached;
        }

        $features = $this->fetch($query, $province);
        if ($features === null) {
            return null;
        }

        $places = $this->toPlaces($features, $province);
        Cache::put($key, $places, now()->addDays((int) config('nhanong.geocoder.cache_days', 30)));

        return $places;
    }

    /**
     * @return list<array<string, mixed>>|null
     */
    private function fetch(string $query, ?string $province): ?array
    {
        $center = Geo::provinceCenter($province);
        try {
            $response = Http::withUserAgent(config('crawler.user_agent'))
                ->timeout(8)
                ->get(config('nhanong.geocoder.url'), array_filter([
                    'q' => $query,
                    'limit' => 30,
                    // Ưu tiên kết quả gần trung tâm tỉnh đang chọn
                    'lat' => $center[0] ?? null,
                    'lon' => $center[1] ?? null,
                ], fn ($value): bool => $value !== null))
                ->throw();
        } catch (ConnectionException|RequestException) {
            return null;
        }

        return array_values((array) $response->json('features', []));
    }

    /**
     * @param  list<array<string, mixed>>  $features
     * @return list<array{name: string, detail: string|null, province: string|null, province_name: string|null, lat: float, lng: float}>
     */
    private function toPlaces(array $features, ?string $province): array
    {
        $places = [];
        foreach ($features as $feature) {
            $props = (array) ($feature['properties'] ?? []);
            [$lng, $lat] = array_map('floatval', (array) ($feature['geometry']['coordinates'] ?? [0, 0])) + [0, 0];
            if (($props['countrycode'] ?? null) !== 'VN' || ! in_array($props['osm_key'] ?? null, self::KINDS, true) || ! isset($props['name'])) {
                continue;
            }

            $code = Provinces::detect($props['state'] ?? null);
            // Đơn vị hành chính cũ đã sáp nhập (huyện, thị xã cũ): ghi rõ "(cũ)"; tâm của nó rơi vào xã nào thì không có ý nghĩa
            $isHistoric = ($props['osm_value'] ?? null) === 'historic';
            $name = (string) $props['name'].($isHistoric ? ' (cũ)' : '');
            // Thuộc xã / phường nào (khi khác tên địa danh)
            $parent = $isHistoric ? null : ($props['county'] ?? $props['city'] ?? null);
            $detail = $parent && ! str_contains(mb_strtolower((string) $parent), mb_strtolower((string) $props['name'])) ? (string) $parent : null;

            $places[] = [
                'name' => $name,
                'detail' => $detail,
                'province' => $code,
                'province_name' => Provinces::name($code),
                'lat' => round($lat, 4),
                'lng' => round($lng, 4),
            ];
        }

        // Bỏ trùng (cùng tên, cùng tỉnh); tỉnh đang chọn xếp trước, còn lại giữ thứ tự liên quan của Photon
        $unique = collect($places)->unique(fn (array $p): string => mb_strtolower($p['name']).'|'.$p['province']);

        return $unique->sortBy(fn (array $p, int $index): array => [$province !== null && $p['province'] !== $province ? 1 : 0, $index])
            ->take(self::MAX_RESULTS)
            ->values()
            ->all();
    }
}
