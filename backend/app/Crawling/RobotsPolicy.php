<?php

namespace App\Crawling;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Đọc robots.txt (cache 1 ngày) và kiểm tra URL có được phép tải không.
 * Áp dụng nhóm luật cho "*" và cho tên bot của mình; luật khớp dài nhất thắng.
 */
class RobotsPolicy
{
    public function allows(string $url): bool
    {
        $parts = parse_url($url);
        $origin = ($parts['scheme'] ?? 'https').'://'.($parts['host'] ?? '');
        $path = ($parts['path'] ?? '/').(isset($parts['query']) ? '?'.$parts['query'] : '');

        $rules = Cache::remember('robots:'.$origin, now()->addDay(), fn (): array => $this->fetchRules($origin));

        $bestLength = -1;
        $allowed = true;
        foreach ($rules as [$isAllow, $pattern]) {
            if ($pattern === '' || ! preg_match($this->toRegex($pattern), $path)) {
                continue;
            }
            if (strlen($pattern) > $bestLength || (strlen($pattern) === $bestLength && $isAllow)) {
                $bestLength = strlen($pattern);
                $allowed = $isAllow;
            }
        }

        return $allowed;
    }

    /**
     * @return list<array{0: bool, 1: string}>
     */
    private function fetchRules(string $origin): array
    {
        try {
            $response = Http::withUserAgent(config('crawler.user_agent'))
                ->connectTimeout(5)
                ->timeout(10)
                ->get($origin.'/robots.txt');
        } catch (Throwable) {
            return [];
        }

        return $response->successful() ? $this->parse($response->body()) : [];
    }

    /**
     * @return list<array{0: bool, 1: string}>
     */
    public function parse(string $robotsTxt): array
    {
        $agent = config('crawler.robots_agent');
        $rules = [];
        $groupAgents = [];
        $readingAgents = false;

        foreach (preg_split('/\r?\n/', $robotsTxt) ?: [] as $line) {
            $line = trim(preg_replace('/#.*/', '', $line) ?? '');
            if (! str_contains($line, ':')) {
                continue;
            }

            [$field, $value] = array_map('trim', explode(':', $line, 2));
            $field = strtolower($field);

            if ($field === 'user-agent') {
                if (! $readingAgents) {
                    $groupAgents = [];
                }
                $groupAgents[] = strtolower($value);
                $readingAgents = true;

                continue;
            }

            $readingAgents = false;
            $appliesToUs = in_array('*', $groupAgents, true) || in_array($agent, $groupAgents, true);
            if ($appliesToUs && in_array($field, ['allow', 'disallow'], true)) {
                $rules[] = [$field === 'allow', $value];
            }
        }

        return $rules;
    }

    private function toRegex(string $pattern): string
    {
        $anchored = str_ends_with($pattern, '$');
        $body = str_replace('\*', '.*', preg_quote(rtrim($pattern, '$'), '#'));

        return '#^'.$body.($anchored ? '$' : '').'#';
    }
}
