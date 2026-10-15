<?php

namespace App\Crawling\Adapters;

use App\Crawling\CrawlBlockedException;
use App\Crawling\Extraction\AliasMatcher;
use App\Crawling\Extraction\PriceExtractor;
use App\Crawling\Fetcher;
use App\Enums\NameKind;
use App\Models\PriceSource;
use App\Models\Product;
use App\Models\Region;
use Carbon\CarbonImmutable;
use Dom\HTMLDocument;
use Illuminate\Database\Eloquent\Collection;
use InvalidArgumentException;
use Throwable;

/**
 * Nguồn là báo điện tử đăng bản tin giá hằng ngày: tìm bài qua sitemap rồi trích giá trong thân bài.
 *
 * Cấu hình (price_sources.config):
 * - sitemap_url: URL sitemap, có thể chứa {date} (Y-m-d)
 * - url_pattern: regex lọc URL bài giá, vd "#/gia-ho-tieu-hom-nay-#"
 * - content_selector: CSS selector phần thân bài, vd "div.article-content"
 * - mode: "by_region" (bài về 1 mặt hàng, giá theo khu vực) hoặc "by_product" (1 khu vực, nhiều mặt hàng)
 * - product_code: mặt hàng cố định khi mode = by_region
 * - region_code: khu vực cố định khi mode = by_product
 * - categories: (by_product) chỉ so khớp mặt hàng thuộc các danh mục (slug) này, vd ["lua", "gao"]
 * - max_articles: số bài tối đa mỗi ngày (mặc định 1)
 */
class SitemapArticleAdapter implements PriceSourceAdapter
{
    public function __construct(private Fetcher $fetcher) {}

    public function discover(PriceSource $source, CarbonImmutable $date): array
    {
        $sitemapUrl = str_replace('{date}', $date->toDateString(), (string) $source->configValue('sitemap_url'));
        $xml = $this->fetcher->get($sitemapUrl);

        preg_match_all('#<loc>\s*(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?\s*</loc>#s', $xml, $matches);

        $urls = array_values(array_unique(array_filter(
            array_map(fn (string $url): string => html_entity_decode(trim($url)), $matches[1]),
            fn (string $url): bool => (bool) preg_match((string) $source->configValue('url_pattern'), $url),
        )));

        return array_slice($urls, 0, (int) $source->configValue('max_articles', 1));
    }

    public function parse(PriceSource $source, string $html): ParsedPage
    {
        $document = HTMLDocument::createFromString($html, LIBXML_NOERROR);
        $selector = (string) $source->configValue('content_selector', 'article');
        $content = $document->querySelector($selector);

        if ($content === null) {
            throw new CrawlBlockedException("Không tìm thấy phần nội dung '{$selector}', có thể trang đã đổi giao diện.");
        }

        $mode = $source->configValue('mode');
        [$entities, $fixedId] = match ($mode) {
            'by_region' => [$this->regions(), $this->productId($source)],
            'by_product' => [$this->products($source), $this->regionId($source)],
            default => throw new InvalidArgumentException("Chế độ nguồn không hợp lệ: {$mode}"),
        };

        $matcherEntities = $entities->mapWithKeys(fn (Product|Region $entity): array => [
            $entity->id => [
                'aliases' => [$entity->name, ...($entity->aliases ?? [])],
                'context' => $entity instanceof Product ? ($entity->context_keywords ?? []) : [],
            ],
        ])->all();

        $result = (new PriceExtractor(new AliasMatcher($matcherEntities)))->extract($content);

        $rows = [];
        foreach ($result->prices as $entityId => $price) {
            $rows[] = new PriceRow(
                productId: $mode === 'by_region' ? $fixedId : $entityId,
                regionId: $mode === 'by_region' ? $entityId : $fixedId,
                min: $price->min,
                max: $price->max,
                avg: $price->avg,
                unit: $price->unit,
            );
        }

        $kind = $mode === 'by_region' ? NameKind::Region : NameKind::Product;
        $unmatched = array_map(fn (string $name): array => ['kind' => $kind, 'name' => $name], $result->unmatchedNames);

        return new ParsedPage($rows, $unmatched, $this->publishedOn($document));
    }

    /**
     * @return Collection<int, Region>
     */
    private function regions(): Collection
    {
        return Region::query()->orderBy('id')->get(['id', 'name', 'aliases']);
    }

    /**
     * @return Collection<int, Product>
     */
    private function products(PriceSource $source): Collection
    {
        $categorySlugs = $source->configValue('categories');

        return Product::query()
            ->active()
            ->when($categorySlugs, fn ($query) => $query->whereHas('category', fn ($q) => $q->whereIn('slug', $categorySlugs)))
            ->orderBy('id')
            ->get(['id', 'name', 'aliases', 'context_keywords']);
    }

    private function productId(PriceSource $source): int
    {
        return Product::query()->where('code', $source->configValue('product_code'))->valueOrFail('id');
    }

    private function regionId(PriceSource $source): int
    {
        return Region::query()->where('code', $source->configValue('region_code'))->valueOrFail('id');
    }

    private function publishedOn(HTMLDocument $document): ?CarbonImmutable
    {
        $value = $document->querySelector('meta[property="article:published_time"], meta[name="article:published_time"]')?->getAttribute('content');
        if ($value === null || $value === '') {
            return null;
        }

        try {
            return CarbonImmutable::parse($value)->setTimezone(config('app.timezone'))->startOfDay();
        } catch (Throwable) {
            return null;
        }
    }
}
