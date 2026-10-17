<?php

namespace App\Shops\Collect\Sources;

use App\Crawling\Fetcher;
use RuntimeException;

/**
 * Cổng dữ liệu mở dạng CKAN (data.cantho.gov.vn, data.haiphong.gov.vn, opendata.thanhhoa.gov.vn…): đường dẫn file đổi
 * mỗi lần tỉnh cập nhật, nên mỗi lần thu thập hỏi API lấy file mới nhất của bộ dữ liệu thay vì gắn cứng đường dẫn.
 */
final class CkanResolver
{
    /**
     * @param  list<string>  $formats  vd ['XLSX', 'XLS']
     */
    public static function latest(Fetcher $fetcher, string $host, string $dataset, array $formats): string
    {
        $json = json_decode($fetcher->get("https://{$host}/api/3/action/package_show?id=".rawurlencode($dataset)), true);
        $resources = collect($json['result']['resources'] ?? [])
            ->filter(fn (array $r): bool => in_array(strtoupper((string) ($r['format'] ?? '')), $formats, true) || in_array(strtoupper(pathinfo((string) ($r['url'] ?? ''), PATHINFO_EXTENSION)), $formats, true))
            ->sortByDesc(fn (array $r): string => (string) ($r['last_modified'] ?? $r['created'] ?? ''));

        $url = $resources->first()['url'] ?? null;
        if (! is_string($url) || $url === '') {
            throw new RuntimeException("Bộ dữ liệu {$dataset} trên {$host} không có file ".implode('/', $formats));
        }

        return $url;
    }
}
