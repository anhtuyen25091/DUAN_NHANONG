<?php

namespace App\Shops\Collect\Sources;

use App\Shops\Collect\CandidateData;
use App\Shops\Collect\ShopSource;
use App\Shops\OsmShopImporter;

/**
 * Điểm bán trên OpenStreetMap (dữ liệu ODbL, ghi nguồn "© OpenStreetMap"). Có sẵn tọa độ, ít số điện thoại.
 */
class OsmSource implements ShopSource
{
    public function __construct(private OsmShopImporter $osm) {}

    public function key(): string
    {
        return 'osm';
    }

    public function label(): string
    {
        return 'OpenStreetMap';
    }

    public function trust(): int
    {
        return 60;
    }

    public function collect(): iterable
    {
        foreach ($this->osm->fetch() as $element) {
            $attributes = $this->osm->toAttributes($element);
            if ($attributes === null) {
                continue;
            }

            yield new CandidateData(
                ref: "{$element['type']}/{$element['id']}",
                name: $attributes['name'],
                address: $attributes['address'],
                province: $attributes['province_code'],
                phone: $attributes['phone'],
                types: $attributes['types'],
                lat: $attributes['lat'] !== null ? (float) $attributes['lat'] : null,
                lng: $attributes['lng'] !== null ? (float) $attributes['lng'] : null,
                url: "https://www.openstreetmap.org/{$element['type']}/{$element['id']}",
                raw: $element['tags'] ?? [],
            );
        }
    }
}
