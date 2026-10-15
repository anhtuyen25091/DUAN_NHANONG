<?php

namespace App\Crawling\Extraction;

use Dom\Element;

/**
 * Trích giá từ thân bài báo, đọc các khối theo thứ tự trong bài để giữ ngữ cảnh.
 *
 * 1. Bảng: cột đầu là tên (mặt hàng/khu vực), các cột còn lại chứa giá; bỏ qua cột "thay đổi/xu hướng".
 * 2. Câu văn: tìm tên rồi lấy mức giá "X - Y đồng/kg" đầu tiên phía sau,
 *    bỏ qua số chỉ mức tăng/giảm ("tăng 2.000 đồng/kg").
 * Bài có bảng giá khớp được tên thì chỉ lấy từ bảng (chính xác hơn); không có mới đọc câu văn.
 *
 * Bài gộp nhiều mặt hàng (vd "Giá nông sản hôm nay": phần cà phê rồi phần tiêu, mỗi phần mở bằng 1 tiêu đề H2):
 * truyền $section = ['start' => regex, 'stop' => regex] (so trên chữ đã bỏ dấu) để chỉ đọc phần của mặt hàng cần lấy.
 * Bài không có H2 nào khớp 'start' thì đọc cả bài như bình thường.
 */
final class PriceExtractor
{
    /** Số tiền có dấu chấm hàng nghìn; không khớp ngày tháng như "14.10.2026" */
    private const NUMBER = '(?<![\d.])\d{1,3}(?:\.\d{3})+(?!\d|\.\d)';

    /** Cột có tiêu đề chứa các từ này không phải giá */
    private const SKIP_COLUMN = '/thay doi|xu huong|tang|giam|chenh|rupee|usd|\+\/-/';

    /** Số đứng ngay sau các từ này là mức chênh lệch, không phải giá */
    private const DELTA_BEFORE = '/(?:tang|giam|hon|chenh lech|chenh|them)(?:\s+(?:tu|khoang))?\s*$/';

    private const UNITS = [
        'kg' => 'kg', 'bao' => 'bao', 'tan' => 'tấn', 'ta' => 'tạ', 'chuc' => 'chục',
        'lit' => 'lít', 'chai' => 'chai', 'goi' => 'gói', 'trai' => 'trái', 'qua' => 'quả', 'bap' => 'bắp',
    ];

    /** Chỉ giữ phần cuối của ngữ cảnh để tìm từ khóa gần nhất */
    private const CONTEXT_LENGTH = 2000;

    /**
     * @param  array{start: string, stop: string}|null  $section
     */
    public function __construct(private AliasMatcher $matcher, private ?array $section = null) {}

    public function extract(Element $content): ExtractionResult
    {
        $tablePrices = [];
        $sentencePrices = [];
        $unmatched = [];
        $context = '';

        foreach ($this->blocks($content) as $block) {
            if ($block->tagName === 'TABLE') {
                [$prices, $names] = $this->fromTable($block, $context);
                $tablePrices += $prices;
                array_push($unmatched, ...$names);

                continue;
            }

            if ($block->closest('table') !== null) {
                continue;
            }

            $text = Text::normalize($block->textContent ?? '');
            $sentencePrices += $this->fromSentences($text, $context, $sentencePrices);
            $context = substr($context.' '.$text, -self::CONTEXT_LENGTH);
        }

        if ($tablePrices !== []) {
            return new ExtractionResult($tablePrices, array_values(array_unique(array_filter($unmatched))));
        }

        return new ExtractionResult($sentencePrices, []);
    }

    /**
     * Các khối cần đọc theo thứ tự trong bài; có $section thì chỉ lấy các khối dưới tiêu đề H2 khớp 'start'.
     *
     * @return list<Element>
     */
    private function blocks(Element $content): array
    {
        $blocks = iterator_to_array($content->querySelectorAll('p, li, h2, h3, h4, table'), false);
        if ($this->section === null) {
            return $blocks;
        }

        $isHeading = fn (Element $block, string $pattern): bool => $block->tagName === 'H2' && preg_match($pattern, Text::normalize($block->textContent ?? '')) === 1;
        if (! array_filter($blocks, fn (Element $block): bool => $isHeading($block, $this->section['start']))) {
            return $blocks;
        }

        $inside = false;
        $result = [];
        foreach ($blocks as $block) {
            if ($block->tagName === 'H2') {
                $inside = $isHeading($block, $this->section['start']) || ($inside && ! preg_match($this->section['stop'], Text::normalize($block->textContent ?? '')));
            }
            if ($inside) {
                $result[] = $block;
            }
        }

        return $result;
    }

    /**
     * @return array{0: array<int, ExtractedPrice>, 1: list<string>}
     */
    private function fromTable(Element $table, string $context): array
    {
        $rows = [];
        foreach ($table->querySelectorAll('tr') as $tr) {
            // Bảng lồng trong bảng: chỉ đọc hàng/ô của chính bảng này, bảng con được đọc riêng
            if ($tr->closest('table') !== $table) {
                continue;
            }
            $cells = array_filter(iterator_to_array($tr->querySelectorAll('th, td'), false), fn (Element $cell): bool => $cell->closest('tr') === $tr);
            $rows[] = array_values(array_map(fn (Element $cell): string => trim($cell->textContent ?? ''), $cells));
        }

        $header = $this->headerRow($rows);
        $skipColumns = [];
        $unit = null;
        foreach ($header ?? [] as $index => $title) {
            $normalized = Text::normalize($title);
            if ($index > 0 && preg_match(self::SKIP_COLUMN, $normalized)) {
                $skipColumns[$index] = true;
            }
            $unit ??= $this->unitFrom($normalized);
        }

        $prices = [];
        $unmatched = [];
        foreach ($header === null ? $rows : array_slice($rows, 1) as $cells) {
            if (count($cells) < 2) {
                continue;
            }

            $ranges = [];
            $singles = [];
            $rowUnit = $unit;
            foreach (array_slice($cells, 1, preserve_keys: true) as $index => $cell) {
                if (isset($skipColumns[$index])) {
                    continue;
                }
                $normalized = Text::normalize($cell);
                $this->collectNumbers($normalized, $ranges, $singles);
                $rowUnit ??= $this->unitFrom($normalized);
            }

            if ($ranges === [] && $singles === []) {
                continue;
            }

            $match = $this->matcher->first(Text::normalize($cells[0]), $context);
            if ($match === null) {
                $unmatched[] = $cells[0];

                continue;
            }

            $price = ExtractedPrice::fromValues($match['id'], $ranges, $singles, $rowUnit);
            if ($price !== null) {
                $prices[$match['id']] ??= $price;
            }
        }

        // Bảng không khớp tên nào (vd bảng giá Ấn Độ, giá bán lẻ) thì coi như không liên quan
        return $prices === [] ? [[], []] : [$prices, $unmatched];
    }

    /**
     * Đọc giá trong câu văn. Trong 1 vế, các tên liền nhau dùng chung mức giá đứng sau:
     * "Đắk Nông, Đắk Lắk (83.000 đ/kg); Bình Phước (84.000 đ/kg) và Bà Rịa - Vũng Tàu ... 85.000 đ/kg".
     *
     * @param  array<int, ExtractedPrice>  $found  giá đã có từ các đoạn trước (giữ lần xuất hiện đầu)
     * @return array<int, ExtractedPrice>
     */
    private function fromSentences(string $text, string $context, array $found): array
    {
        $prices = [];
        $clauseContext = $context;

        foreach (preg_split('/;|(?<!\d)\.(?!\d)/', $text) ?: [] as $clause) {
            $pending = [];
            $position = 0;
            $assign = function (string $segment) use (&$pending, &$prices, $found): void {
                $price = $pending === [] ? null : $this->firstPrice($segment);
                if ($price === null) {
                    return;
                }
                foreach ($pending as $id) {
                    if (! isset($found[$id]) && ! isset($prices[$id])) {
                        $value = ExtractedPrice::fromValues($id, $price['range'], $price['single'], $price['unit']);
                        if ($value !== null) {
                            $prices[$id] = $value;
                        }
                    }
                }
                $pending = [];
            };

            while (($match = $this->matcher->first(substr($clause, $position), $clauseContext.' '.substr($clause, 0, $position))) !== null) {
                // Đoạn giữa tên trước và tên này có giá => giá đó thuộc nhóm tên trước
                $assign(substr($clause, $position, $match['offset']));
                $pending[] = $match['id'];
                $position += $match['end'];
            }
            $assign(substr($clause, $position));

            $clauseContext .= ' '.$clause;
        }

        return $prices;
    }

    /**
     * Mức giá "X - Y đồng/kg" đầu tiên trong đoạn, bỏ qua số chỉ mức tăng/giảm.
     *
     * @return array{range: list<int>, single: list<int>, unit: ?string}|null
     */
    private function firstPrice(string $segment): ?array
    {
        $pricePattern = '/('.self::NUMBER.')(?:\s*-\s*('.self::NUMBER.'))?\s*(?:dong|d)\s*\/\s*([a-z]+)/';
        if (! preg_match_all($pricePattern, $segment, $matches, PREG_SET_ORDER | PREG_OFFSET_CAPTURE)) {
            return null;
        }

        foreach ($matches as $match) {
            if (preg_match(self::DELTA_BEFORE, substr($segment, 0, $match[0][1]))) {
                continue;
            }

            $first = Text::toInt($match[1][0]);
            $isRange = ($match[2][0] ?? '') !== '';
            $unit = $this->unitFrom('dong/'.$match[3][0]);

            return $isRange
                ? ['range' => [$first, Text::toInt($match[2][0])], 'single' => [], 'unit' => $unit]
                : ['range' => [], 'single' => [$first], 'unit' => $unit];
        }

        return null;
    }

    /**
     * Hàng tiêu đề là hàng đầu tiên nếu nó không chứa số tiền nào.
     *
     * @param  list<list<string>>  $rows
     * @return list<string>|null
     */
    private function headerRow(array $rows): ?array
    {
        if ($rows === []) {
            return null;
        }

        return preg_match('/'.self::NUMBER.'/', Text::normalize(implode(' ', $rows[0]))) ? null : $rows[0];
    }

    /**
     * @param  list<int>  $ranges
     * @param  list<int>  $singles
     */
    private function collectNumbers(string $cell, array &$ranges, array &$singles): void
    {
        if (preg_match('/('.self::NUMBER.')\s*-\s*('.self::NUMBER.')/', $cell, $range)) {
            $ranges[] = Text::toInt($range[1]);
            $ranges[] = Text::toInt($range[2]);

            return;
        }

        if (preg_match('/'.self::NUMBER.'/', $cell, $single)) {
            $singles[] = Text::toInt($single[0]);
        }
    }

    private function unitFrom(string $normalized): ?string
    {
        if (! preg_match('/(?:dong|d)\s*\/\s*([a-z]+)/', $normalized, $match)) {
            return null;
        }

        return self::UNITS[$match[1]] ?? $match[1];
    }
}
