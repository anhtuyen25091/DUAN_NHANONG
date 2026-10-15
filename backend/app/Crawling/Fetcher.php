<?php

namespace App\Crawling;

use GuzzleHttp\Cookie\CookieJar;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;
use Throwable;

/**
 * Tải trang cho crawler: tôn trọng robots.txt, nghỉ giữa các request cùng host, thử lại khi lỗi mạng.
 */
class Fetcher
{
    /** @var array<string, float> host => thời điểm request gần nhất */
    private array $lastRequestAt = [];

    public function __construct(private RobotsPolicy $robots) {}

    /**
     * @throws CrawlBlockedException
     * @throws RequestException
     * @throws ConnectionException
     */
    public function get(string $url): string
    {
        if (! $this->robots->allows($url)) {
            throw new CrawlBlockedException("robots.txt không cho phép tải: {$url}");
        }

        $this->waitForHost((string) parse_url($url, PHP_URL_HOST));

        return Http::withUserAgent(config('crawler.user_agent'))
            ->connectTimeout(10)
            ->timeout(config('crawler.timeout'))
            ->retry([2000, 5000], 0, fn (Throwable $e): bool => $e instanceof ConnectionException
                || ($e instanceof RequestException && ($e->response->serverError() || $e->response->status() === 429)))
            ->get($url)
            ->throw()
            ->body();
    }

    /**
     * Tải trang dạng form (vd trang ASP.NET cần __VIEWSTATE): GET khi $form = null, ngược lại POST form.
     * Dùng chung $cookies giữa các lần gọi để giữ phiên. Trả về nội dung thô (có thể không phải UTF-8).
     *
     * @param  array<string, string>|null  $form
     * @param  bool  $retryServerErrors  false khi lỗi 5xx là kết quả bình thường (vd xuất Excel bảng rỗng)
     *
     * @throws CrawlBlockedException
     * @throws RequestException
     * @throws ConnectionException
     */
    public function submit(string $url, ?array $form, CookieJar $cookies, bool $retryServerErrors = true): string
    {
        if (! $this->robots->allows($url)) {
            throw new CrawlBlockedException("robots.txt không cho phép tải: {$url}");
        }

        $this->waitForHost((string) parse_url($url, PHP_URL_HOST));

        $request = Http::withUserAgent(config('crawler.user_agent'))
            ->withOptions(['cookies' => $cookies])
            ->connectTimeout(10)
            ->timeout(max(120, (int) config('crawler.timeout')))
            ->retry([5000, 15000], 0, fn (Throwable $e): bool => $e instanceof ConnectionException
                || ($e instanceof RequestException && (($retryServerErrors && $e->response->serverError()) || $e->response->status() === 429)));

        try {
            $response = $form === null ? $request->get($url) : $request->asForm()->post($url, $form);
        } finally {
            // Trang form thường chạy truy vấn nặng: tính thời gian nghỉ từ lúc nhận xong phản hồi
            $this->lastRequestAt[(string) parse_url($url, PHP_URL_HOST)] = microtime(true);
        }

        return $response->throw()->body();
    }

    private function waitForHost(string $host): void
    {
        $delayMs = config('crawler.delay_ms');
        $last = $this->lastRequestAt[$host] ?? null;

        if ($last !== null) {
            $waitMs = (int) ($delayMs - (microtime(true) - $last) * 1000);
            if ($waitMs > 0) {
                Sleep::for($waitMs)->milliseconds();
            }
        }

        $this->lastRequestAt[$host] = microtime(true);
    }
}
