<?php

namespace App\Crawling;

use App\Crawling\Adapters\ParsedPage;
use App\Crawling\Extraction\Text;
use App\Enums\PriceStatus;
use App\Models\Price;
use App\Models\PriceSource;
use App\Models\Product;
use App\Models\UnmatchedName;
use Carbon\CarbonImmutable;

/**
 * Ghi giá đã trích vào bảng prices.
 * - Bỏ giá sai đơn vị (vd mặt hàng tính theo kg mà bài ghi "đồng/chục").
 * - Giá lệch nhiều so với lần trước => "Cần duyệt", chưa hiển thị cho người dùng.
 * - Không ghi đè giá admin đã loại.
 */
class PriceImporter
{
    /**
     * @return array{imported: int, skipped: int}
     */
    public function import(PriceSource $source, CarbonImmutable $date, string $url, ParsedPage $page): array
    {
        $units = Product::query()
            ->whereIn('id', array_map(fn ($row) => $row->productId, $page->rows))
            ->pluck('unit', 'id');

        $imported = 0;
        $skipped = 0;

        foreach ($page->rows as $row) {
            $productUnit = $units[$row->productId] ?? null;
            if ($productUnit === null || ($row->unit !== null && $row->unit !== $productUnit)) {
                $skipped++;

                continue;
            }

            $keys = [
                'product_id' => $row->productId,
                'region_id' => $row->regionId,
                'price_source_id' => $source->id,
                'date' => $date->toDateString(),
            ];

            $existing = Price::query()->where($keys)->first();
            if ($existing?->status === PriceStatus::Rejected) {
                $skipped++;

                continue;
            }

            Price::query()->updateOrCreate($keys, [
                'price_min' => $row->min,
                'price_max' => $row->max,
                'price_avg' => $row->avg,
                'unit' => $productUnit,
                'status' => $this->isAnomaly($row->productId, $row->regionId, $date, $row->avg)
                    ? PriceStatus::NeedsReview
                    : PriceStatus::Published,
                'source_url' => $url,
            ]);
            $imported++;
        }

        $this->recordUnmatched($source, $url, $page);

        return ['imported' => $imported, 'skipped' => $skipped];
    }

    /**
     * So với giá liền trước (kể cả giá đang chờ duyệt, trừ giá admin đã loại): giá nhảy thật > 30% thì chỉ
     * ngày đầu bị đánh dấu, các ngày sau so với chính mức mới nên không bị kẹt "cần duyệt" mãi.
     */
    private function isAnomaly(int $productId, int $regionId, CarbonImmutable $date, int $avg): bool
    {
        $previous = Price::query()
            ->where('status', '!=', PriceStatus::Rejected)
            ->where('product_id', $productId)
            ->where('region_id', $regionId)
            ->where('date', '<', $date->toDateString())
            ->orderByDesc('date')
            ->value('price_avg');

        if ($previous === null || $previous === 0) {
            return false;
        }

        return abs($avg - $previous) / $previous > config('crawler.anomaly_threshold');
    }

    private function recordUnmatched(PriceSource $source, string $url, ParsedPage $page): void
    {
        foreach ($page->unmatched as $item) {
            $name = UnmatchedName::query()->firstOrNew([
                'price_source_id' => $source->id,
                'kind' => $item['kind'],
                'normalized' => Text::normalize($item['name']),
            ]);

            $name->fill([
                'name' => $item['name'],
                'sample_url' => $url,
                'seen_count' => $name->exists ? $name->seen_count + 1 : 1,
                'last_seen_at' => now(),
            ])->save();
        }
    }
}
