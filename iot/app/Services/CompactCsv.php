<?php

namespace App\Services;

/**
 * Dạng gọn cho mạch yếu, file điện thoại tải từ thiết bị và tin nhắn SMS: mỗi dòng "t,metric,value".
 * t để trống = lúc nhận. Bỏ qua dòng trống, dòng tiêu đề và dòng bắt đầu bằng #.
 *
 *   1730170000,soil_moisture,41.5
 *   1730170000,soil_ph,6.4
 *
 * SMS chỉ 160 ký tự nên có thêm dạng gọn cho 1 lần đo: "@1730170000;soil_moisture=41.5;soil_ph=6.4".
 */
final class CompactCsv
{
    /**
     * @return list<array{t: ?string, metric: string, value: string}>
     */
    public static function parse(string $content): array
    {
        if (str_starts_with(ltrim($content), '@')) {
            return self::parseSnapshot(ltrim($content));
        }

        $rows = [];
        foreach (preg_split('/\r\n|\r|\n|;/', $content) as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#') || str_starts_with($line, 't,')) {
                continue;
            }

            $parts = array_map('trim', explode(',', $line));
            $rows[] = [
                't' => ($parts[0] ?? '') === '' ? null : $parts[0],
                'metric' => $parts[1] ?? '',
                'value' => $parts[2] ?? '',
            ];
        }

        return $rows;
    }

    /**
     * @return list<array{t: ?string, metric: string, value: string}>
     */
    private static function parseSnapshot(string $content): array
    {
        $parts = array_map('trim', explode(';', substr($content, 1)));
        $t = array_shift($parts);

        $rows = [];
        foreach ($parts as $part) {
            if ($part === '') {
                continue;
            }
            [$metric, $value] = array_pad(explode('=', $part, 2), 2, '');
            $rows[] = ['t' => $t === '' ? null : $t, 'metric' => trim($metric), 'value' => trim($value)];
        }

        return $rows;
    }
}
