<?php

namespace App\Shops;

use App\Crawling\Extraction\Text;
use App\Enums\ShopType;

/**
 * Đoán loại điểm bán từ tên (và thẻ OSM). Không đoán được thì trả mảng rỗng để bỏ qua.
 */
final class ShopClassifier
{
    /** Nơi không phục vụ nhà nông mua bán trực tiếp */
    private const EXCLUDE = ['nha may', 'xuong', 'chi cuc', 'cuc ', 'so nong nghiep', 'sat vun', 'phe lieu', 'ke sieu thi', 'dong vat', 'dien thoai', 'xe cu', 'do cu', 'vang bac', 'cam '];

    private const THU_MUA_GOODS = ['ca phe', 'tieu', 'lua', 'gao', 'nong san', 'sau rieng', 'dieu', 'cao su', 'mi', 'khoai', 'bap', 'ngo', 'trai cay', 'hoa qua', 'thanh long', 'cacao', 'ca cao'];

    /**
     * @param  array<string, string>  $tags  thẻ OSM (shop, agrarian…) nếu có
     * @return list<ShopType>
     */
    public static function classify(string $name, array $tags = []): array
    {
        $text = ' '.Text::normalize($name).' ';
        foreach (self::EXCLUDE as $word) {
            if (str_contains($text, ' '.$word)) {
                return [];
            }
        }

        $types = [];
        $hasAny = fn (array $words): bool => array_any($words, fn (string $word): bool => str_contains($text, ' '.$word.' '));

        if ($hasAny(['phan bon', 'phan', 'npk', 'ure', 'dap'])) {
            $types[] = ShopType::PhanBon;
        }
        if ($hasAny(['thuoc bvtv', 'bvtv', 'bao ve thuc vat', 'thuoc tru sau', 'thuoc nong nghiep'])) {
            $types[] = ShopType::ThuocBvtv;
        }
        if ($hasAny(['vat tu nong nghiep', 'vtnn', 'vat tu nn'])) {
            $types = [ShopType::PhanBon, ShopType::ThuocBvtv];
        }
        if (($hasAny(['thu mua', 'dai ly', 'vua', 'kho']) && $hasAny(self::THU_MUA_GOODS)) || $hasAny(['thu mua nong san'])) {
            $types[] = ShopType::ThuMua;
        }

        $agrarian = (string) ($tags['agrarian'] ?? '');
        if ($types === [] && (($tags['shop'] ?? null) === 'agrarian' || ($tags['shop'] ?? null) === 'fertilizer_supplier')) {
            $types = str_contains($agrarian, 'pesticide') ? [ShopType::ThuocBvtv] : [ShopType::PhanBon, ShopType::ThuocBvtv];
        }
        if (str_contains($agrarian, 'fertilizer') && ! in_array(ShopType::PhanBon, $types, true)) {
            $types[] = ShopType::PhanBon;
        }
        if (str_contains($agrarian, 'pesticide') && ! in_array(ShopType::ThuocBvtv, $types, true)) {
            $types[] = ShopType::ThuocBvtv;
        }

        return array_values(array_unique($types, SORT_REGULAR));
    }
}
