<?php

namespace App\Crawling\Adapters;

use App\Crawling\CrawlBlockedException;
use App\Crawling\Extraction\AliasMatcher;
use App\Crawling\Extraction\Text;
use App\Models\PriceSource;
use App\Models\Product;
use App\Models\Region;
use Dom\Element;
use Dom\HTMLDocument;

/**
 * Bản tin "Giá sầu riêng hôm nay" (vd thuonghieucongluan.com.vn): giá theo vùng, theo giống và theo loại (A/B/C, 1/2/3, VIP).
 * Cách trình bày đổi liên tục (bảng mỗi tỉnh 1 bảng, câu văn "Sầu Thái loại A dao động 70.000 - 85.000 đồng/kg, loại B …",
 * mục "Đối với sầu Thái:" rồi từng vùng …) nên đọc từng dòng theo thứ tự và nhớ trạng thái:
 * - Vùng: tên khu vực/tỉnh đứng trước mức giá đầu tiên của dòng (dòng tiêu đề "Tại Đắk Lắk:" hoặc "Khu vực ĐBSCL thu mua …").
 *   Dòng nhắc nhiều vùng lớn cùng lúc (câu mở bài "tại các khu vực ĐBSCL, Đông Nam Bộ, Tây Nguyên") thì bỏ vùng đang nhớ.
 *   Giá của tỉnh được lưu cho tỉnh (nếu có trong danh mục khu vực) và cho vùng lớn chứa tỉnh (lần xuất hiện đầu tiên).
 * - Giống: tên mặt hàng (alias "Ri6", "Thái" …) gần nhất; giống khác (Musang King, Chuồng Bò …) thì bỏ qua.
 * - Loại: CHỈ lấy loại A ("loại A", "loại 1", "Ri6 A"); bỏ VIP, loại B/C/2/3, hàng dạt/lỗi/kem, lột múi, xô.
 *   Loại A là mức báo nào cũng ghi và ổn định nhất qua các năm.
 *
 * Cấu hình thêm (ngoài các khóa của SitemapArticleAdapter: sitemap_url, url_pattern, content_selector, categories, price_range):
 * - other_varieties: tên các giống không lưu, vd ["Musang King", "Chuồng Bò"]
 * - macro_regions: {"mã vùng lớn": ["mã tỉnh", …]}, vd {"tay-nguyen": ["dak-lak", "gia-lai"]}
 */
class DurianArticleAdapter extends SitemapArticleAdapter
{
    private const NUMBER = '(?<![\d.])\d{1,3}(?:\.\d{3})+(?!\d|\.\d)';

    /** Loại A: "loại A", "loại 1", hoặc chữ "A" ngay sau tên giống ("Ri6 A"); không tính "A-B", "1-2" */
    private const GRADE_A = '/(?:(?<![a-z0-9])loai\s+(?:a|1)|^\s*a)(?![a-z0-9])(?!\s*-\s*[a-d0-9])/';

    /** Đứng giữa tên giống và "loại A" thì không phải hàng loại A thông thường */
    private const NOT_REGULAR = '/(?<![a-z])(?:vip|hang loi|loi|dat|kem|lot mui|mui|xo|chin|cap dong)(?![a-z])/';

    private const DELTA_BEFORE = '/(?:tang|giam|chenh lech|chenh|them|hon)(?:\s+(?:tu|khoang))?\s*$/';

    public function parse(PriceSource $source, string $html): ParsedPage
    {
        $document = HTMLDocument::createFromString($html, LIBXML_NOERROR);
        $selector = (string) $source->configValue('content_selector', 'article');
        $content = $document->querySelector($selector);

        if ($content === null) {
            throw new CrawlBlockedException("Không tìm thấy phần nội dung '{$selector}', có thể trang đã đổi giao diện.");
        }

        $products = Product::query()->active()
            ->whereHas('category', fn ($query) => $query->whereIn('slug', (array) $source->configValue('categories', [])))
            ->orderBy('id')
            ->get(['id', 'name', 'aliases']);
        // Chỉ dùng alias: tên mặt hàng có chữ "(loại A)" sẽ nuốt mất phần loại khi so khớp
        $varieties = $products->mapWithKeys(fn (Product $product): array => [$product->id => ['aliases' => $product->aliases ?? []]])->all();
        foreach ((array) $source->configValue('other_varieties', []) as $index => $name) {
            $varieties[-1 - $index] = ['aliases' => [$name]];
        }
        $varietyMatcher = new AliasMatcher($varieties);

        $regions = Region::query()->orderBy('id')->get(['id', 'code', 'name', 'province', 'aliases']);
        $regionMatcher = new AliasMatcher($regions->mapWithKeys(fn (Region $region): array => [$region->id => ['aliases' => [$region->name, ...($region->aliases ?? [])]]])->all());
        $macroOf = $this->macroRegions($source, $regions);

        [$minPrice, $maxPrice] = $source->configValue('price_range') ?? [0, PHP_INT_MAX];
        $prices = [];
        $macro = null;
        $province = null;
        $variety = null;

        foreach ($this->lines($content) as $text) {
            $text = preg_replace('/(?<![a-z])thai lan(?![a-z])/', 'xx', $text) ?? $text;

            // Vùng: các tên khu vực đứng trước mức giá đầu tiên của dòng
            $prefix = preg_match('/'.self::NUMBER.'/', $text, $first, PREG_OFFSET_CAPTURE) ? substr($text, 0, $first[0][1]) : $text;
            $mentioned = $this->allMatches($regionMatcher, $prefix);
            if ($mentioned !== []) {
                $macros = array_unique(array_map(fn (int $id): int => $macroOf[$id] ?? $id, $mentioned));
                if (count($macros) > 1) {
                    [$macro, $province] = [null, null];
                } else {
                    $macro = $macros[0];
                    $provinces = array_values(array_filter($mentioned, fn (int $id): bool => $id !== $macro));
                    $province = $provinces === [] ? null : end($provinces);
                }
            }

            // Giống: chia dòng thành các đoạn bắt đầu bằng tên giống; đoạn đầu dùng giống đang nhớ
            $segments = [];
            $start = 0;
            foreach ($this->allMatches($varietyMatcher, $text, withOffsets: true) as [$id, $offset, $end]) {
                $segments[] = [$variety, substr($text, $start, $offset - $start)];
                $variety = $id;
                $start = $end;
            }
            $segments[] = [$variety, substr($text, $start)];

            foreach ($segments as [$productId, $segment]) {
                if ($productId === null || $productId < 0 || ($macro === null && $province === null)) {
                    continue;
                }
                $price = $this->gradeAPrice($segment);
                if ($price === null || $price[2] < $minPrice || $price[2] > $maxPrice) {
                    continue;
                }
                foreach (array_filter([$province, $macro]) as $regionId) {
                    $prices[$productId.'|'.$regionId] ??= new PriceRow($productId, $regionId, $price[0], $price[1], $price[2], 'kg');
                }
            }
        }

        return new ParsedPage(array_values($prices), [], $this->publishedOn($document));
    }

    /**
     * Chữ (đã chuẩn hóa) của từng đoạn/mục/hàng bảng trong bài, theo thứ tự.
     *
     * @return list<string>
     */
    private function lines(Element $content): array
    {
        $lines = [];
        foreach ($content->querySelectorAll('p, li, h2, h3, h4, tr') as $block) {
            if ($block->tagName !== 'TR' && $block->parentElement?->closest('p, li, tr') !== null) {
                continue; // Đã đọc cùng khối cha
            }
            if ($block->tagName === 'TR') {
                $text = implode(' | ', array_map(fn (Element $cell): string => $cell->textContent ?? '', iterator_to_array($block->querySelectorAll('td, th'), false)));
            } else {
                $text = $block->textContent ?? '';
            }
            $normalized = Text::normalize($text);
            if ($normalized !== '') {
                $lines[] = $normalized;
            }
        }

        return $lines;
    }

    /**
     * Giá loại A đầu tiên trong đoạn: [min, max, avg] hoặc null.
     *
     * @return array{0: int, 1: int, 2: int}|null
     */
    private function gradeAPrice(string $segment): ?array
    {
        if (! preg_match(self::GRADE_A, $segment, $grade, PREG_OFFSET_CAPTURE)) {
            return null;
        }
        // "Thái đống" (hàng gom đống) đứng ngay sau tên giống; không lẫn với "đồng bằng" ở chỗ khác
        if (preg_match(self::NOT_REGULAR, substr($segment, 0, $grade[0][1])) || preg_match('/^\s*dong(?![a-z\/])/', $segment)) {
            return null;
        }

        $after = substr($segment, $grade[0][1] + strlen($grade[0][0]), 160);
        if (preg_match('/(?<![a-z])loai\s/', $after, $next, PREG_OFFSET_CAPTURE)) {
            $after = substr($after, 0, $next[0][1]); // Chỉ đọc tới loại kế tiếp
        }

        preg_match_all('/('.self::NUMBER.')(?:\s*-\s*('.self::NUMBER.'))?/', $after, $matches, PREG_SET_ORDER | PREG_OFFSET_CAPTURE);
        foreach ($matches as $match) {
            if (preg_match(self::DELTA_BEFORE, substr($after, 0, $match[0][1]))) {
                continue;
            }
            $values = [Text::toInt($match[1][0])];
            if (($match[2][0] ?? '') !== '') {
                $values[] = Text::toInt($match[2][0]);
            }

            return [min($values), max($values), (int) round((min($values) + max($values)) / 2)];
        }

        return null;
    }

    /**
     * Mọi tên khớp trong chữ, theo thứ tự xuất hiện.
     *
     * @return list<int>|list<array{0: int, 1: int, 2: int}> id, hoặc [id, offset, end] khi $withOffsets
     */
    private function allMatches(AliasMatcher $matcher, string $text, bool $withOffsets = false): array
    {
        $found = [];
        $position = 0;
        while (($match = $matcher->first(substr($text, $position))) !== null) {
            $found[] = $withOffsets ? [$match['id'], $position + $match['offset'], $position + $match['end']] : $match['id'];
            $position += $match['end'];
        }

        return $found;
    }

    /**
     * id tỉnh => id vùng lớn chứa tỉnh (theo cấu hình macro_regions).
     *
     * @param  iterable<Region>  $regions
     * @return array<int, int>
     */
    private function macroRegions(PriceSource $source, iterable $regions): array
    {
        $ids = [];
        foreach ($regions as $region) {
            $ids[$region->code] = $region->id;
        }

        $macroOf = [];
        foreach ((array) $source->configValue('macro_regions', []) as $macroCode => $provinceCodes) {
            foreach ($provinceCodes as $code) {
                if (isset($ids[$code], $ids[$macroCode])) {
                    $macroOf[$ids[$code]] = $ids[$macroCode];
                }
            }
        }

        return $macroOf;
    }
}
