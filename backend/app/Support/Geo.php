<?php

namespace App\Support;

use Illuminate\Database\Eloquent\Builder;

/**
 * Tính khoảng cách và lọc theo bán kính (chạy được cả MySQL lẫn SQLite):
 * lọc thô bằng khung vuông trong SQL, rồi tính khoảng cách thật bằng PHP.
 */
final class Geo
{
    /** Tọa độ trung tâm hành chính 34 tỉnh/thành (dùng khi người dùng chỉ chọn tỉnh, không bật GPS) */
    private const PROVINCE_CENTERS = [
        'ha-noi' => [21.0285, 105.8542], 'hue' => [16.4637, 107.5909], 'lai-chau' => [22.3964, 103.4582],
        'dien-bien' => [21.3860, 103.0230], 'son-la' => [21.3270, 103.9141], 'lang-son' => [21.8537, 106.7610],
        'quang-ninh' => [20.9590, 107.0448], 'thanh-hoa' => [19.8067, 105.7852], 'nghe-an' => [18.6796, 105.6813],
        'ha-tinh' => [18.3428, 105.9057], 'cao-bang' => [22.6657, 106.2570], 'tuyen-quang' => [21.8233, 105.2180],
        'lao-cai' => [21.7051, 104.8752], 'thai-nguyen' => [21.5942, 105.8482], 'phu-tho' => [21.3227, 105.4019],
        'bac-ninh' => [21.2731, 106.1946], 'hung-yen' => [20.6464, 106.0511], 'hai-phong' => [20.8449, 106.6881],
        'ninh-binh' => [20.2506, 105.9745], 'quang-tri' => [17.4689, 106.6223], 'da-nang' => [16.0544, 108.2022],
        'quang-ngai' => [15.1214, 108.8044], 'gia-lai' => [13.7820, 109.2194], 'khanh-hoa' => [12.2388, 109.1967],
        'lam-dong' => [11.9404, 108.4583], 'dak-lak' => [12.6667, 108.0500], 'ho-chi-minh' => [10.7769, 106.7009],
        'dong-nai' => [10.9574, 106.8427], 'tay-ninh' => [10.5359, 106.4137], 'can-tho' => [10.0452, 105.7469],
        'vinh-long' => [10.2397, 105.9572], 'dong-thap' => [10.3600, 106.3600], 'ca-mau' => [9.1769, 105.1524],
        'an-giang' => [10.0125, 105.0809],
    ];

    /**
     * @return array{0: float, 1: float}|null
     */
    public static function provinceCenter(?string $code): ?array
    {
        return $code === null ? null : (self::PROVINCE_CENTERS[$code] ?? null);
    }

    public static function distanceKm(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);
        $a = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;

        return 6371 * 2 * atan2(sqrt($a), sqrt(1 - $a));
    }

    /**
     * Lọc thô các dòng có cột lat/lng nằm trong khung vuông bao quanh vòng tròn bán kính.
     *
     * @template TModel of \Illuminate\Database\Eloquent\Model
     *
     * @param  Builder<TModel>  $query
     * @return Builder<TModel>
     */
    public static function withinBox(Builder $query, float $lat, float $lng, float $radiusKm, string $latColumn = 'lat', string $lngColumn = 'lng'): Builder
    {
        $dLat = $radiusKm / 111.0;
        $dLng = $radiusKm / (111.0 * max(cos(deg2rad($lat)), 0.01));

        return $query
            ->whereBetween($latColumn, [$lat - $dLat, $lat + $dLat])
            ->whereBetween($lngColumn, [$lng - $dLng, $lng + $dLng]);
    }
}
