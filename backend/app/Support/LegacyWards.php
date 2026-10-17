<?php

namespace App\Support;

use App\Crawling\Extraction\Text;

/**
 * Xã / phường / thị trấn và huyện **cũ** (trước sáp nhập 01/07/2025, 10.040 xã) kèm tọa độ tâm,
 * để đặt điểm bán theo địa chỉ cũ (danh sách của Sở vẫn ghi xã cũ; OSM đã bỏ tên các xã này).
 * Dữ liệu: database/data/legacy_wards.csv (nguồn và giấy phép: database/data/LICENSE-legacy_wards.txt).
 */
final class LegacyWards
{
    /** @var array<string, array{wards: array<string, array<string, array{0: float, 1: float}>>, districts: array<string, array{0: float, 1: float}>}>|null */
    private static ?array $index = null;

    /**
     * Tâm xã cũ. Không ghi huyện, hoặc huyện không khớp, thì chỉ nhận khi tên xã chỉ có 1 trong tỉnh.
     *
     * @return array{lat: float, lng: float}|null
     */
    public static function ward(?string $province, string $ward, ?string $district = null): ?array
    {
        $byProvince = self::index()[(string) $province] ?? null;
        $candidates = $byProvince['wards'][self::bare($ward)] ?? [];
        if ($candidates === []) {
            return null;
        }
        if ($district !== null && isset($candidates[self::bare($district)])) {
            [$lat, $lng] = $candidates[self::bare($district)];

            return ['lat' => $lat, 'lng' => $lng];
        }
        if (count($candidates) === 1) {
            [$lat, $lng] = reset($candidates);

            return ['lat' => $lat, 'lng' => $lng];
        }

        return null;
    }

    /**
     * Tâm huyện / thị xã / thành phố cũ.
     *
     * @return array{lat: float, lng: float}|null
     */
    public static function district(?string $province, string $district): ?array
    {
        $point = self::index()[(string) $province]['districts'][self::bare($district)] ?? null;

        return $point === null ? null : ['lat' => $point[0], 'lng' => $point[1]];
    }

    /** Tên không dấu, bỏ chữ "xã / phường / huyện…" ở đầu, bỏ số 0 đầu ("Phường 01" = "Phường 1") */
    public static function bare(string $name): string
    {
        $text = Text::normalize(str_replace(['.', '-'], ' ', $name));
        $text = trim((string) preg_replace('/^(xa|phuong|thi tran|tt|huyen|thi xa|thanh pho|quan|tp|tx|p)\s+/', '', $text));

        return (string) preg_replace('/\b0+(\d)/', '$1', $text);
    }

    /**
     * @return array<string, array{wards: array<string, array<string, array{0: float, 1: float}>>, districts: array<string, array{0: float, 1: float}>}>
     */
    private static function index(): array
    {
        if (self::$index !== null) {
            return self::$index;
        }

        $index = [];
        $handle = fopen(database_path('data/legacy_wards.csv'), 'r');
        if ($handle === false) {
            return self::$index = [];
        }
        fgetcsv($handle, escape: '');
        $provinces = [];
        while (($row = fgetcsv($handle, escape: '')) !== false) {
            [$province, , $district, , $ward, $wardLat, $wardLng, $districtLat, $districtLng] = $row;
            // Tỉnh cũ → tỉnh mới (vd Tiền Giang → Đồng Tháp)
            $code = $provinces[$province] ??= (string) Provinces::detect($province);
            $districtKey = self::bare($district);
            $index[$code]['districts'][$districtKey] ??= [(float) $districtLat, (float) $districtLng];
            if ($wardLat !== '') {
                $index[$code]['wards'][self::bare($ward)][$districtKey] = [(float) $wardLat, (float) $wardLng];
            }
        }
        fclose($handle);

        return self::$index = $index;
    }
}
