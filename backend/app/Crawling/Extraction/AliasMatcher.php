<?php

namespace App\Crawling\Extraction;

/**
 * Tìm tên mặt hàng / khu vực trong một đoạn chữ dựa trên danh sách alias.
 *
 * - So khớp không phân biệt dấu; khoảng trắng và gạch ngang trong alias coi như nhau,
 *   nên "Bà Rịa Vũng Tàu" khớp cả "Bà Rịa – Vũng Tàu".
 * - Lấy tên xuất hiện sớm nhất; cùng vị trí thì ưu tiên alias dài hơn.
 * - Nhiều thực thể cùng khớp một tên (vd "OM 18" là cả lúa tươi lẫn gạo nguyên liệu) thì chọn
 *   thực thể có từ khóa ngữ cảnh xuất hiện gần nhất phía trước; không phân định được thì bỏ qua.
 */
final class AliasMatcher
{
    /** @var list<array{id: int, pattern: string, length: int}> */
    private array $patterns = [];

    /** @var array<int, list<string>> id => từ khóa ngữ cảnh đã chuẩn hóa */
    private array $contexts = [];

    /**
     * @param  array<int, array{aliases: list<string>, context?: list<string>}>  $entities
     */
    public function __construct(array $entities)
    {
        foreach ($entities as $id => $entity) {
            $this->contexts[$id] = array_values(array_filter(array_map(Text::normalize(...), $entity['context'] ?? [])));

            foreach ($entity['aliases'] as $alias) {
                $words = preg_split('/[\s\-]+/', Text::normalize($alias), flags: PREG_SPLIT_NO_EMPTY) ?: [];
                if ($words === []) {
                    continue;
                }

                $body = implode('[\s\-]+', array_map(fn (string $word): string => preg_quote($word, '/'), $words));
                $this->patterns[] = [
                    'id' => $id,
                    'pattern' => '/(?<![a-z0-9])'.$body.'(?![a-z0-9])/',
                    'length' => mb_strlen(implode(' ', $words)),
                ];
            }
        }
    }

    /**
     * @param  string  $normalizedText  đoạn cần tìm (đã chuẩn hóa)
     * @param  string  $precedingText  chữ phía trước đoạn này trong bài (đã chuẩn hóa), dùng làm ngữ cảnh
     * @return array{id: int, offset: int, end: int}|null
     */
    public function first(string $normalizedText, string $precedingText = ''): ?array
    {
        $best = null;
        $tied = [];

        foreach ($this->patterns as $pattern) {
            if (! preg_match($pattern['pattern'], $normalizedText, $match, PREG_OFFSET_CAPTURE)) {
                continue;
            }

            $candidate = [
                'id' => $pattern['id'],
                'offset' => $match[0][1],
                'end' => $match[0][1] + strlen($match[0][0]),
                'length' => $pattern['length'],
            ];

            $isBetter = $best === null
                || $candidate['offset'] < $best['offset']
                || ($candidate['offset'] === $best['offset'] && $candidate['length'] > $best['length']);

            if ($isBetter) {
                $best = $candidate;
                $tied = [$candidate['id'] => true];
            } elseif ($candidate['offset'] === $best['offset'] && $candidate['length'] === $best['length']) {
                $tied[$candidate['id']] = true;
            }
        }

        if ($best === null) {
            return null;
        }

        if (count($tied) > 1) {
            $id = $this->resolveByContext(array_keys($tied), $precedingText.' '.substr($normalizedText, 0, $best['offset']));
            if ($id === null) {
                return null;
            }
            $best['id'] = $id;
        }

        return ['id' => $best['id'], 'offset' => $best['offset'], 'end' => $best['end']];
    }

    /**
     * @param  list<int>  $ids
     */
    private function resolveByContext(array $ids, string $context): ?int
    {
        $bestId = null;
        $bestPosition = -1;

        foreach ($ids as $id) {
            foreach ($this->contexts[$id] as $keyword) {
                $position = strrpos($context, $keyword);
                if ($position !== false && $position > $bestPosition) {
                    $bestPosition = $position;
                    $bestId = $id;
                }
            }
        }

        return $bestId;
    }
}
