<?php

namespace App\Crawling\Adapters;

use App\Crawling\CrawlBlockedException;
use App\Crawling\Extraction\AliasMatcher;
use App\Crawling\Extraction\Text;
use App\Enums\NameKind;
use App\Models\PriceSource;
use App\Models\Product;
use App\Models\Region;
use Carbon\CarbonImmutable;
use Dom\Element;
use Dom\HTMLDocument;
use Throwable;

/**
 * Trang bảng giá cố định (vd bảng giá sỉ của doanh nghiệp), mỗi cột giá là một khu vực.
 * Giá được lưu theo ngày cập nhật ghi trên trang, không phải ngày chạy.
 *
 * Cấu hình (price_sources.config):
 * - url: trang bảng giá
 * - table_selector: CSS selector của bảng (mặc định "table")
 * - date_selector: phần tử chứa ngày cập nhật, đọc thuộc tính datetime hoặc chữ dạng d/m/Y
 * - name_column: chỉ số cột tên mặt hàng (tính từ 0)
 * - region_columns: {"chỉ số cột": "mã khu vực"}, vd {"2": "tp-hcm", "3": "ha-noi"}
 * - categories: chỉ so khớp mặt hàng thuộc các danh mục (slug) này
 * - same_day_only: false
 */
class PageTableAdapter implements PriceSourceAdapter
{
    public function discover(PriceSource $source, CarbonImmutable $date): array
    {
        return [(string) $source->configValue('url')];
    }

    public function parse(PriceSource $source, string $html): ParsedPage
    {
        $document = HTMLDocument::createFromString($html, LIBXML_NOERROR);
        $selector = (string) $source->configValue('table_selector', 'table');
        $table = $document->querySelector($selector);

        if ($table === null) {
            throw new CrawlBlockedException("Không tìm thấy bảng giá '{$selector}', có thể trang đã đổi giao diện.");
        }

        $regionIds = Region::query()
            ->whereIn('code', array_values((array) $source->configValue('region_columns')))
            ->pluck('id', 'code');
        $columns = collect((array) $source->configValue('region_columns'))
            ->mapWithKeys(fn (string $code, int|string $index): array => [(int) $index => $regionIds[$code] ?? null])
            ->filter();

        $products = Product::query()
            ->active()
            ->whereHas('category', fn ($query) => $query->whereIn('slug', (array) $source->configValue('categories')))
            ->orderBy('id')
            ->get(['id', 'name', 'aliases', 'context_keywords']);
        $matcher = new AliasMatcher($products->mapWithKeys(fn (Product $product): array => [
            $product->id => ['aliases' => [$product->name, ...($product->aliases ?? [])], 'context' => $product->context_keywords ?? []],
        ])->all());

        $nameColumn = (int) $source->configValue('name_column', 0);
        $rows = [];
        $unmatched = [];

        foreach ($table->querySelectorAll('tr') as $tr) {
            $cells = array_map(
                fn (Element $cell): string => trim($cell->textContent ?? ''),
                iterator_to_array($tr->querySelectorAll('th, td')),
            );

            $pricesByRegion = [];
            foreach ($columns as $index => $regionId) {
                if (preg_match('/^(\d{1,3}(?:\.\d{3})+)$/', Text::normalize($cells[$index] ?? ''), $match)) {
                    $pricesByRegion[$regionId] = Text::toInt($match[1]);
                }
            }

            if ($pricesByRegion === []) {
                continue;
            }

            $name = $cells[$nameColumn] ?? '';
            $found = $matcher->first(Text::normalize($name));
            if ($found === null) {
                $unmatched[] = ['kind' => NameKind::Product, 'name' => $name];

                continue;
            }

            foreach ($pricesByRegion as $regionId => $price) {
                $rows[] = new PriceRow($found['id'], $regionId, $price, $price, $price, null);
            }
        }

        return new ParsedPage($rows, $unmatched, $this->updatedOn($document, $source));
    }

    private function updatedOn(HTMLDocument $document, PriceSource $source): ?CarbonImmutable
    {
        $element = $document->querySelector((string) $source->configValue('date_selector', 'time'));
        if ($element === null) {
            return null;
        }

        try {
            $datetime = $element->getAttribute('datetime');
            if ($datetime) {
                return CarbonImmutable::parse($datetime)->startOfDay();
            }

            if (preg_match('#(\d{1,2})/(\d{1,2})/(\d{4})#', $element->textContent ?? '', $match)) {
                return CarbonImmutable::create((int) $match[3], (int) $match[2], (int) $match[1]);
            }
        } catch (Throwable) {
            return null;
        }

        return null;
    }
}
