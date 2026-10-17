<?php

namespace App\Shops\Collect\Sources;

use App\Crawling\Extraction\Text;
use Smalot\PdfParser\Parser;

/**
 * Dựng lại bảng từ file PDF có chữ (không phải bản scan) bằng vị trí từng đoạn chữ:
 * - cột: lấy theo dòng tiêu đề (ô "TT" / "STT" và các ô cùng hàng), ranh giới cột = giữa 2 tiêu đề kề nhau
 * - dòng: mỗi số thứ tự ở cột đầu là 1 dòng; chữ của 1 ô có thể xuống nhiều hàng và nằm lệch trên / dưới số thứ tự,
 *   nên chữ thuộc dòng nào tính theo khoảng giữa 2 số thứ tự liền nhau
 * Trả về các dòng (mảng ô), dòng đầu là tiêu đề, để đưa vào LicenseTable như bảng Excel / HTML.
 */
final class PdfTable
{
    /** Chữ cách dòng tiêu đề trong khoảng này (điểm PDF) vẫn tính là tiêu đề (tiêu đề 2 tầng: "Địa chỉ" / "Bản | Xã") */
    private const HEADER_BAND = 40;

    /**
     * @return list<list<string>>
     */
    public static function rows(string $pdfContent): array
    {
        $document = (new Parser)->parseContent($pdfContent);
        $columns = null;
        $headerCells = [];
        $rows = [];

        foreach ($document->getPages() as $page) {
            $items = self::items($page->getDataTm());
            usort($items, fn (array $a, array $b): int => [$b['y'], $a['x']] <=> [$a['y'], $b['x']]);
            if ($items === []) {
                continue;
            }

            // Tiêu đề (trang đầu, có khi lặp lại ở mỗi trang)
            $header = self::findHeader($items);
            if ($header !== null) {
                [$columns, $headerCells, $headerY] = $header;
                // Chỉ lấy phần dưới tiêu đề bảng (bỏ tên văn bản, "Cập nhật đến ngày…" ở trên)
                $items = array_values(array_filter($items, fn (array $i): bool => $i['y'] < $headerY - 20));
            }
            if ($columns === null) {
                continue;
            }

            // Số thứ tự ở cột đầu: mốc của từng dòng
            $firstRight = $columns[1] ?? INF;
            $anchors = array_values(array_filter($items, fn (array $i): bool => $i['x'] < $firstRight && preg_match('/^\d{1,5}$/', $i['text']) === 1));
            usort($anchors, fn (array $a, array $b): int => $b['y'] <=> $a['y']);
            if ($anchors === []) {
                continue;
            }
            // Cột STT hẹp, tên ở cột sau căn trái sát bên: ranh giới = ngay sau số thứ tự dài nhất
            $pageColumns = $columns;
            if (isset($pageColumns[1])) {
                $pageColumns[1] = min($pageColumns[1], max(array_column($anchors, 'x')) + 18);
            }

            $bands = [];
            foreach ($anchors as $k => $anchor) {
                $top = $k === 0 ? INF : ($anchors[$k - 1]['y'] + $anchor['y']) / 2;
                $bottom = isset($anchors[$k + 1]) ? ($anchor['y'] + $anchors[$k + 1]['y']) / 2 : $anchor['y'] - 3 * self::lineHeight($anchors);
                $bands[] = [$top, $bottom];
            }

            foreach ($bands as $k => [$top, $bottom]) {
                $cells = array_fill(0, count($columns), []);
                foreach ($items as $item) {
                    if ($item['y'] <= $top && $item['y'] > $bottom) {
                        $cells[self::column($pageColumns, $item['x'])][] = $item;
                    }
                }
                $rows[] = array_map(function (array $parts): string {
                    usort($parts, fn (array $a, array $b): int => [$b['y'], $a['x']] <=> [$a['y'], $b['x']]);

                    return trim((string) preg_replace('/\s+/u', ' ', implode(' ', array_column($parts, 'text'))));
                }, $cells);
            }
        }

        return $rows === [] ? [] : [$headerCells, ...$rows];
    }

    /**
     * @param  list<array{0: array<int, float|string>, 1: string}>  $data
     * @return list<array{x: float, y: float, text: string}>
     */
    private static function items(array $data): array
    {
        $items = [];
        foreach ($data as [$matrix, $text]) {
            $text = trim(str_replace("\t", ' ', (string) $text));
            if ($text !== '') {
                $items[] = ['x' => (float) $matrix[4], 'y' => (float) $matrix[5], 'text' => $text];
            }
        }

        return $items;
    }

    /**
     * Tìm dòng tiêu đề: ô "TT" / "STT", rồi các ô quanh nó; đủ cột tên + địa chỉ / xã thì nhận.
     *
     * @param  list<array{x: float, y: float, text: string}>  $items
     * @return array{0: list<float>, 1: list<string>, 2: float}|null [vị trí bắt đầu từng cột, tên cột, y của tiêu đề]
     */
    private static function findHeader(array $items): ?array
    {
        foreach ($items as $stt) {
            if (preg_match('/^s?tt\.?$/i', $stt['text']) !== 1) {
                continue;
            }
            // Tiêu đề nằm ngang hàng "TT" hoặc phía trên / dưới 1 chút (tiêu đề 2 tầng)
            $band = array_values(array_filter($items, fn (array $i): bool => $i['y'] >= $stt['y'] - 20 && $i['y'] <= $stt['y'] + self::HEADER_BAND));
            usort($band, fn (array $a, array $b): int => [$a['x'], $b['y']] <=> [$b['x'], $a['y']]);
            // Gộp các đoạn chữ cùng cột (tiêu đề xuống dòng: "Tên cơ" / "sở"), rồi chỉ giữ ô đúng là tên cột
            $merged = [];
            foreach ($band as $cell) {
                $last = $merged === [] ? null : array_key_last($merged);
                if ($last !== null && abs($merged[$last]['x'] - $cell['x']) < 6 && abs($merged[$last]['y'] - $cell['y']) < 16) {
                    $merged[$last]['text'] .= ' '.$cell['text'];
                } else {
                    $merged[] = $cell;
                }
            }
            $merged = array_values(array_filter($merged, fn (array $i): bool => LicenseTable::isHeaderWord($i['text'])));
            // Ô tiêu đề cha ("Địa chỉ" phủ trên "Bản | Xã | Huyện"): có ô con thì bỏ ô cha
            $merged = array_values(array_filter($merged, fn (array $i): bool => Text::normalize($i['text']) !== 'dia chi' || ! self::hasChildren($merged, $i)));
            $names = array_column($merged, 'text');
            if (LicenseTable::header($names) === null) {
                continue;
            }
            $x = array_column($merged, 'x');
            // Ranh giới cột: giữa 2 tiêu đề kề nhau (tiêu đề thường căn giữa, chữ trong ô căn trái)
            $starts = [-INF];
            for ($k = 1; $k < count($x); $k++) {
                $starts[] = ($x[$k - 1] + $x[$k]) / 2;
            }

            return [$starts, $names, $stt['y']];
        }

        return null;
    }

    /**
     * @param  list<array{x: float, y: float, text: string}>  $band
     * @param  array{x: float, y: float, text: string}  $parent
     */
    private static function hasChildren(array $band, array $parent): bool
    {
        return array_any($band, fn (array $i): bool => $i['y'] < $parent['y'] - 5
            && preg_match('#^(ban|thon|ap|xa|phuong|huyen|quan|tinh)(\b|/)#', Text::normalize($i['text'])) === 1);
    }

    /**
     * @param  list<float>  $starts
     */
    private static function column(array $starts, float $x): int
    {
        $column = 0;
        foreach ($starts as $k => $start) {
            if ($x >= $start) {
                $column = $k;
            }
        }

        return $column;
    }

    /**
     * @param  list<array{x: float, y: float, text: string}>  $anchors
     */
    private static function lineHeight(array $anchors): float
    {
        if (count($anchors) < 2) {
            return 12;
        }
        $gaps = [];
        for ($k = 1; $k < count($anchors); $k++) {
            $gaps[] = $anchors[$k - 1]['y'] - $anchors[$k]['y'];
        }
        sort($gaps);

        return max(8, min(20, $gaps[intdiv(count($gaps), 2)] / 2));
    }
}
