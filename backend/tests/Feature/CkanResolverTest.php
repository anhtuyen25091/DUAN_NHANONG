<?php

namespace Tests\Feature;

use App\Crawling\Fetcher;
use App\Shops\Collect\Sources\CkanResolver;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Tests\TestCase;

class CkanResolverTest extends TestCase
{
    public function test_picks_newest_file_of_wanted_format(): void
    {
        config(['crawler.delay_ms' => 0]);
        Http::fake([
            'data.example.vn/robots.txt' => Http::response('', 404),
            'data.example.vn/api/3/action/package_show*' => Http::response(['result' => ['resources' => [
                ['format' => 'XLSX', 'url' => 'https://data.example.vn/old.xlsx', 'last_modified' => '2025-01-01T00:00:00'],
                ['format' => 'PDF', 'url' => 'https://data.example.vn/new.pdf', 'last_modified' => '2026-06-01T00:00:00'],
                ['format' => '', 'url' => 'https://data.example.vn/new.xlsx', 'created' => '2026-05-29T00:00:00'],
            ]]]),
        ]);

        $this->assertSame('https://data.example.vn/new.xlsx', CkanResolver::latest(app(Fetcher::class), 'data.example.vn', 'abc', ['XLSX']));

        $this->expectException(RuntimeException::class);
        CkanResolver::latest(app(Fetcher::class), 'data.example.vn', 'abc', ['DOCX']);
    }
}
