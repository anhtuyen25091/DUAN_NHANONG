<?php

namespace App\Shops\Collect;

use App\Crawling\Extraction\Text;
use App\Support\Geo;
use App\Support\LegacyWards;
use App\Support\Provinces;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;

/**
 * Lấy tọa độ cho địa chỉ điểm bán qua Photon (OpenStreetMap, miễn phí, config nhanong.geocoder.url).
 *
 * Danh sách của Sở chỉ ghi thôn / xã / huyện, nên chỉ tìm **địa danh hành chính / khu dân cư** và bắt buộc tên khớp:
 * tìm thử thẳng địa chỉ thì Photon hay trả bừa 1 tòa nhà / trạm xe buýt có chữ giống (đã gặp: "Xóm 3, xã Thạch Khê"
 * ra "Bảo hiểm Xã hội Hà Tĩnh", có địa chỉ ra tận Hà Nội).
 * Thứ tự: bảng xã / huyện cũ có sẵn tọa độ (LegacyWards, tra trên máy, không gọi mạng; danh sách của Sở vẫn ghi xã cũ)
 * → Photon tìm xã mới / thôn. Kết quả Photon phải nằm gần huyện ghi trong địa chỉ (≤ 25 km) để không lấy nhầm nơi trùng tên.
 *   thôn hoặc xã / phường / thị trấn khớp → place · huyện (cũ) khớp → district · không ra → tâm tỉnh (province)
 * Sau này đổi sang VietMap / Goong (đọc được số nhà) chỉ cần thay class này.
 */
class ShopGeocoder
{
    /** Loại đối tượng OSM nhận là địa danh hành chính / khu dân cư */
    private const PLACE_KEYS = ['place', 'boundary'];

    /** Cách tâm huyện xa hơn mức này thì coi là nơi khác trùng tên (km) */
    private const MAX_FROM_DISTRICT_KM = 25;

    private const COMMUNE = '(?:xã|phường|thị trấn|tt\.?|p\.)';

    private const DISTRICT = '(?:huyện|thị xã|thành phố|tx\.?|tp\.?|quận)';

    /** Phần đầu của địa chỉ không phải tên xã (thôn, xóm, tổ, khối, số nhà…) */
    private const LOCAL = '/^(?:thôn|xóm|xón|tổ|tdp|tổ dân phố|khối|khối phố|kp|ấp|khóm|bản|đội|số|ngõ|kiệt|hẻm|đường|chợ|dp)\b/iu';

    private float $lastCallAt = 0;

    /**
     * @return array{lat: float, lng: float, precision: string}|null
     *
     * @throws ConnectionException|RequestException dịch vụ lỗi: không lấy tâm tỉnh, để lần xử lý sau thử lại
     */
    public function locate(?string $address, ?string $province): ?array
    {
        [$commune, $district] = $this->parse((string) $address);
        $hamlet = $this->hamlet((string) $address);
        $provinceName = Provinces::name($province);

        if ($commune !== null) {
            $legacy = LegacyWards::ward($province, $commune, $district);
            if ($legacy !== null) {
                return [...$legacy, 'precision' => 'place'];
            }
        }

        $districtHit = $district === null ? null
            : LegacyWards::district($province, $district) ?? $this->findPlace($district, null, $provinceName, $province, null);
        // Xã mới (sau sáp nhập), rồi thôn
        foreach ([$commune, $hamlet] as $name) {
            if ($name === null) {
                continue;
            }
            $hit = $this->findPlace($name, $district, $provinceName, $province, $districtHit);
            if ($hit !== null) {
                return [...$hit, 'precision' => 'place'];
            }
        }
        if ($districtHit !== null) {
            return [...$districtHit, 'precision' => 'district'];
        }

        $center = Geo::provinceCenter($province);

        return $center === null ? null : ['lat' => $center[0], 'lng' => $center[1], 'precision' => 'province'];
    }

    /** Tên thôn / xóm / ấp có tên riêng (không phải số): "Thôn Vĩnh Phú, xã Phú Lộc" → "Vĩnh Phú" */
    public function hamlet(string $address): ?string
    {
        $first = trim((string) (preg_split('/[,;]|\s[-–]\s/u', $address) ?: [''])[0]);
        if (preg_match('/^(?:thôn|xóm|ấp|bản|khóm|làng)\s+(.+)$/iu', $first, $m) !== 1 || preg_match('/\d/', $m[1]) === 1) {
            return null;
        }

        return trim($m[1]);
    }

    /**
     * Tên xã và tên huyện trong địa chỉ (không kèm chữ "xã", "huyện").
     * "Thôn 2, xã Đức Bồng, huyện Vũ Quang" → ["Đức Bồng", "Vũ Quang"]; "Thôn Thống Nhất, Phù Việt, huyện Thạch Hà" → ["Phù Việt", "Thạch Hà"]
     *
     * @return array{0: string|null, 1: string|null}
     */
    public function parse(string $address): array
    {
        // Bỏ ghi chú trong ngoặc: "xã Thạch Kênh (Cty Vinafam)"
        $address = (string) preg_replace('/\([^)]*\)?/u', ' ', $address);
        $parts = array_values(array_filter(array_map(fn (string $p): string => trim((string) preg_replace('/\s+/u', ' ', $p), " .\t"), preg_split('/[,;]|\s[-–]\s/u', $address) ?: [])));
        $commune = null;
        $district = null;
        $plain = [];
        foreach ($parts as $part) {
            if (preg_match('/^'.self::COMMUNE.'\s+(.+)$/iu', $part, $m) === 1) {
                $commune ??= trim($m[1]);
            } elseif (preg_match('/^'.self::DISTRICT.'\s+(.+)$/iu', $part, $m) === 1) {
                $district ??= trim($m[1]);
            } elseif (preg_match(self::LOCAL, $part) !== 1 && Provinces::detect($part) === null && preg_match('/\d/', $part) !== 1) {
                $plain[] = $part;
            }
        }
        // Không ghi chữ "xã" / "huyện" (bỏ thôn / xóm / số nhà): "Mỹ Hiệp, Cao Lãnh" → xã Mỹ Hiệp, huyện Cao Lãnh
        if ($commune === null && $plain !== []) {
            if ($district === null && count($plain) >= 2) {
                [$commune, $district] = array_slice($plain, -2);
            } else {
                $commune = end($plain);
            }
        }

        return [$commune, $district];
    }

    /**
     * @param  array{lat: float, lng: float}|null  $near  kết quả phải cách điểm này ≤ MAX_FROM_DISTRICT_KM
     * @return array{lat: float, lng: float}|null
     */
    private function findPlace(string $name, ?string $within, ?string $provinceName, ?string $province, ?array $near): ?array
    {
        $query = implode(', ', array_filter([$name, $within, $provinceName]));
        $key = 'shop-geo3:'.md5(mb_strtolower($query).'|'.$province.'|'.json_encode($near));
        $cached = Cache::get($key);
        if (is_array($cached)) {
            return $cached['hit'] ?? null;
        }

        $hit = null;
        $wanted = $this->bare($name);
        foreach ($this->search($query, $province, $near) as $feature) {
            $props = (array) ($feature['properties'] ?? []);
            if (($props['countrycode'] ?? null) !== 'VN' || ! in_array($props['osm_key'] ?? null, self::PLACE_KEYS, true)) {
                continue;
            }
            $foundProvince = Provinces::detect($props['state'] ?? null) ?? Provinces::detect($props['city'] ?? null);
            if ($province !== null && $foundProvince !== $province) {
                continue;
            }
            if ($this->bare((string) ($props['name'] ?? '')) !== $wanted) {
                continue;
            }
            [$lng, $lat] = array_map('floatval', (array) ($feature['geometry']['coordinates'] ?? [0, 0])) + [0, 0];
            if ($near !== null && Geo::distanceKm($lat, $lng, $near['lat'], $near['lng']) > self::MAX_FROM_DISTRICT_KM) {
                continue;
            }
            $hit = ['lat' => round($lat, 7), 'lng' => round($lng, 7)];
            break;
        }

        Cache::put($key, ['hit' => $hit], now()->addDays(90));

        return $hit;
    }

    /** Tên không dấu, bỏ chữ "xã / phường / huyện…" ở đầu: "Xã Đức Bồng" → "duc bong" */
    private function bare(string $name): string
    {
        $text = Text::normalize($name);

        return trim((string) preg_replace('/^(xa|phuong|thi tran|huyen|thi xa|thanh pho|quan|tp|tx|thon|xom|ap|ban|khom|lang)\s+/', '', $text));
    }

    /**
     * @param  array{lat: float, lng: float}|null  $near
     * @return list<array<string, mixed>>
     */
    private function search(string $query, ?string $province, ?array $near): array
    {
        // Dịch vụ miễn phí: tối đa ~1 lần / giây
        $wait = (int) config('shops.geocode_delay_ms', 1100) - (int) ((microtime(true) - $this->lastCallAt) * 1000);
        if ($wait > 0) {
            Sleep::for($wait)->milliseconds();
        }
        $this->lastCallAt = microtime(true);

        // Ưu tiên kết quả gần huyện (hoặc tâm tỉnh)
        $center = $near !== null ? [$near['lat'], $near['lng']] : Geo::provinceCenter($province);

        return array_values((array) Http::withUserAgent(config('crawler.user_agent'))
            ->timeout(10)
            ->retry([2000, 5000], 0, fn ($e): bool => $e instanceof ConnectionException || ($e instanceof RequestException && ($e->response->serverError() || $e->response->status() === 429)))
            ->get(config('nhanong.geocoder.url'), array_filter([
                'q' => $query,
                'limit' => 15,
                'lat' => $center[0] ?? null,
                'lon' => $center[1] ?? null,
            ], fn ($value): bool => $value !== null))
            ->throw()
            ->json('features', []));
    }
}
