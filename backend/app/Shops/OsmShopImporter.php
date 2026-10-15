<?php

namespace App\Shops;

use App\Models\Shop;
use App\Support\Provinces;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Nhập điểm bán từ OpenStreetMap qua Overpass API (dữ liệu ODbL, phải ghi nguồn "© OpenStreetMap").
 * Điểm admin đã xác minh thì không ghi đè.
 */
class OsmShopImporter
{
    private const ENDPOINTS = [
        'https://overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
    ];

    private const NAME_PATTERN = 'phân bón|Phân Bón|PHÂN BÓN|vật tư nông nghiệp|Vật Tư Nông Nghiệp|Vật tư nông nghiệp|VTNN|thuốc BVTV|Thuốc BVTV|bảo vệ thực vật|Bảo Vệ Thực Vật|Bảo vệ thực vật|thu mua|Thu Mua|Thu mua|Đại lý cà phê|Đại Lý Cà Phê|đại lý nông sản|Đại Lý Nông Sản|Đại lý nông sản';

    /**
     * @return array{imported: int, updated: int, skipped: int}
     */
    public function run(): array
    {
        $counts = ['imported' => 0, 'updated' => 0, 'skipped' => 0];

        foreach ($this->fetch() as $element) {
            $tags = $element['tags'] ?? [];
            $attributes = $this->toAttributes($element);
            if ($attributes === null) {
                $counts['skipped']++;

                continue;
            }

            $shop = Shop::query()->firstOrNew(['source_ref' => "osm:{$element['type']}/{$element['id']}"]);
            if ($shop->exists && $shop->is_verified) {
                $counts['skipped']++;

                continue;
            }

            $counts[$shop->exists ? 'updated' : 'imported']++;
            $shop->fill([...$attributes, 'source' => 'osm'])->save();
        }

        return $counts;
    }

    /**
     * @param  array<string, mixed>  $element
     * @return array<string, mixed>|null
     */
    public function toAttributes(array $element): ?array
    {
        $tags = $element['tags'] ?? [];
        $name = trim((string) ($tags['name:vi'] ?? $tags['name'] ?? ''));
        if ($name === '') {
            return null;
        }

        $types = ShopClassifier::classify($name, $tags);
        if ($types === []) {
            return null;
        }

        $address = implode(', ', array_filter([
            trim(($tags['addr:housenumber'] ?? '').' '.($tags['addr:street'] ?? '')),
            $tags['addr:subdistrict'] ?? null,
            $tags['addr:district'] ?? null,
            $tags['addr:city'] ?? null,
            $tags['addr:province'] ?? null,
        ]));

        return [
            'name' => $name,
            'types' => $types,
            'address' => $address !== '' ? $address : null,
            'province_code' => Provinces::detect($tags['addr:province'] ?? $tags['addr:city'] ?? $address),
            'lat' => $element['lat'] ?? $element['center']['lat'] ?? null,
            'lng' => $element['lon'] ?? $element['center']['lon'] ?? null,
            'phone' => $tags['phone'] ?? $tags['contact:phone'] ?? null,
            'opening_hours' => $tags['opening_hours'] ?? null,
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function fetch(): array
    {
        $query = '[out:json][timeout:120];area["ISO3166-1"="VN"][admin_level=2]->.vn;('
            .'nwr["shop"~"^(agrarian|fertilizer_supplier)$"](area.vn);'
            .'nwr["name"~"'.self::NAME_PATTERN.'"](area.vn);'
            .');out center tags;';

        // Overpass hay quá tải và có khi trả trang lỗi HTML với mã 200: thử lại, đổi server
        foreach ([0, 10, 30] as $wait) {
            sleep($wait);
            foreach (self::ENDPOINTS as $endpoint) {
                try {
                    $response = Http::withUserAgent(config('crawler.user_agent'))
                        ->timeout(180)
                        ->asForm()
                        ->post($endpoint, ['data' => $query]);
                    $elements = $response->successful() ? $response->json('elements') : null;
                    if (is_array($elements)) {
                        return $elements;
                    }
                    Log::warning('Overpass trả lỗi', ['endpoint' => $endpoint, 'status' => $response->status(), 'body' => mb_substr(strip_tags($response->body()), 0, 300)]);
                } catch (ConnectionException $e) {
                    Log::warning('Overpass không kết nối được', ['endpoint' => $endpoint, 'error' => $e->getMessage()]);
                }
            }
        }

        throw new RuntimeException('Không tải được dữ liệu từ Overpass API.');
    }
}
