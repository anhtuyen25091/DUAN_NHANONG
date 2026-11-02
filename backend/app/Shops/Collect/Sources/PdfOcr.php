<?php

namespace App\Shops\Collect\Sources;

use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Str;
use Normalizer;
use RuntimeException;
use Throwable;

/**
 * Nhận dạng chữ (OCR) cho file PDF bản scan: pdftoppm (poppler) vẽ từng trang ra ảnh, tesseract (tiếng Việt) đọc ảnh ra TSV
 * (từng chữ kèm vị trí). Các chữ liền nhau trên 1 hàng được gộp thành đoạn, đổi sang toạ độ PDF (điểm, gốc dưới trái)
 * để PdfTable dựng bảng y như với PDF có chữ.
 *
 * Cấu hình: config/shops.php → 'ocr' (TESSERACT_BIN, PDFTOPPM_BIN, TESSDATA_PREFIX…).
 */
class PdfOcr
{
    /** Ký tự đường kẻ bảng mà tesseract hay đọc thành chữ: bỏ đi, và coi như ranh giới ô */
    private const BORDER = '/^[|\[\]_=—–\-~¦!:;.,\'"`‘’“”]+$/u';

    private ?bool $available = null;

    /**
     * Máy có đủ công cụ không (pdftoppm, tesseract, dữ liệu ngôn ngữ). Thiếu thì báo rõ thiếu gì và cách cài.
     *
     * @throws OcrUnavailableException
     */
    public function ensureAvailable(): void
    {
        if ($this->available === true) {
            return;
        }
        $missing = [];

        $pdftoppm = $this->run([$this->bin('pdftoppm'), '-v'], 30);
        if ($pdftoppm === null || ! str_contains(strtolower($pdftoppm), 'pdftoppm')) {
            $missing[] = 'pdftoppm ('.$this->bin('pdftoppm').', gói poppler / poppler-utils)';
        }

        $langs = $this->run([$this->bin('tesseract'), '--list-langs'], 30);
        if ($langs === null) {
            $missing[] = 'tesseract ('.$this->bin('tesseract').')';
        } else {
            foreach (explode('+', $this->lang()) as $lang) {
                if (preg_match('/^'.preg_quote($lang, '/').'$/m', $langs) !== 1) {
                    $missing[] = "dữ liệu tiếng \"{$lang}\" của tesseract ({$lang}.traineddata".($this->tessdata() !== null ? ' trong '.$this->tessdata() : '').')';
                }
            }
        }

        if ($missing !== []) {
            $this->available = false;

            throw new OcrUnavailableException('PDF bản scan cần OCR nhưng máy thiếu: '.implode('; ', $missing).'. Xem README mục "Điểm bán / thu mua" để cài.');
        }
        $this->available = true;
    }

    /**
     * Đọc chữ của $pageCount trang đầu (tối đa 'max_pages'), trả về đoạn chữ của từng trang theo toạ độ PDF.
     *
     * @return list<list<array{x: float, y: float, text: string}>>
     *
     * @throws OcrUnavailableException
     * @throws RuntimeException khi pdftoppm / tesseract lỗi hoặc quá thời gian
     */
    public function pages(string $pdfContent, int $pageCount): array
    {
        $this->ensureAvailable();

        $dir = rtrim(sys_get_temp_dir(), '/').'/shops-ocr-'.Str::random(12);
        File::ensureDirectoryExists($dir);
        try {
            $pdf = "{$dir}/input.pdf";
            File::put($pdf, $pdfContent);
            $dpi = $this->dpi();
            $pages = [];
            for ($page = 1; $page <= min($pageCount, (int) config('shops.ocr.max_pages', 200)); $page++) {
                $prefix = "{$dir}/page-{$page}";
                $this->mustRun([$this->bin('pdftoppm'), '-r', (string) $dpi, '-gray', '-png', '-f', (string) $page, '-l', (string) $page, '-singlefile', $pdf, $prefix], 'pdftoppm');
                if (! is_file("{$prefix}.png")) {
                    throw new RuntimeException("pdftoppm không tạo được ảnh trang {$page}");
                }
                $tsv = $this->mustRun([
                    $this->bin('tesseract'), "{$prefix}.png", 'stdout', '-l', $this->lang(), '--dpi', (string) $dpi,
                    '--psm', (string) config('shops.ocr.psm', 6), 'tsv',
                ], 'tesseract');
                File::delete("{$prefix}.png");
                $pages[] = self::itemsFromTsv($tsv, $dpi);
            }

            return $pages;
        } finally {
            File::deleteDirectory($dir);
        }
    }

    /**
     * Kết quả TSV của tesseract → các đoạn chữ (toạ độ PDF). Trên mỗi hàng, chữ cách nhau ít (khoảng trắng thường) thì gộp
     * thành 1 đoạn; cách xa (sang ô khác) hoặc gặp đường kẻ thì tách đoạn, giống từng ô chữ trong PDF có chữ.
     *
     * @return list<array{x: float, y: float, text: string}>
     */
    public static function itemsFromTsv(string $tsv, int $dpi): array
    {
        $scale = 72 / $dpi;
        $pageHeight = 0;
        /** @var array<string, list<array{left: int, top: int, width: int, height: int, text: string}>> $lines */
        $lines = [];
        foreach (preg_split('/\R/', $tsv) ?: [] as $row) {
            $cols = explode("\t", $row, 12);
            if (count($cols) < 12 || ! ctype_digit($cols[0])) {
                continue;
            }
            [$level, , $block, $par, $line, , $left, $top, $width, $height, $conf, $text] = $cols;
            if ($level === '1') {
                $pageHeight = (int) $height;
            }
            $text = trim($text);
            if ($level !== '5' || $text === '' || (float) $conf < 0) {
                continue;
            }
            $lines["{$block}.{$par}.{$line}"][] = ['left' => (int) $left, 'top' => (int) $top, 'width' => (int) $width, 'height' => (int) $height, 'text' => $text];
        }

        $items = [];
        foreach ($lines as $words) {
            usort($words, fn (array $a, array $b): int => $a['left'] <=> $b['left']);
            $heights = array_column($words, 'height');
            sort($heights);
            // Khoảng trắng giữa 2 chữ thường < 0,8 chiều cao chữ; giữa 2 ô thì rộng hơn
            $maxGap = 0.8 * $heights[intdiv(count($heights), 2)];

            $phrases = [];
            $current = [];
            foreach ($words as $word) {
                if (preg_match(self::BORDER, $word['text']) === 1) {
                    $phrases[] = $current;
                    $current = [];

                    continue;
                }
                $last = $current === [] ? null : $current[array_key_last($current)];
                if ($last !== null && $maxGap < $word['left'] - ($last['left'] + $last['width'])) {
                    $phrases[] = $current;
                    $current = [];
                }
                $current[] = $word;
            }
            $phrases[] = $current;

            foreach ($phrases as $phrase) {
                if ($phrase === []) {
                    continue;
                }
                $text = self::clean(implode(' ', array_column($phrase, 'text')));
                if ($text === '') {
                    continue;
                }
                // Chân chữ trung bình ≈ dòng kẻ chữ; ảnh tính từ trên xuống, PDF tính từ dưới lên
                $bottom = array_sum(array_map(fn (array $w): int => $w['top'] + $w['height'], $phrase)) / count($phrase);
                $items[] = ['x' => round($phrase[0]['left'] * $scale, 2), 'y' => round(($pageHeight - $bottom) * $scale, 2), 'text' => $text];
            }
        }

        return $items;
    }

    /**
     * Sửa lỗi OCR hay gặp có ảnh hưởng tới việc đọc bảng:
     * - dấu tiếng Việt về dạng dựng sẵn (NFC), gọn khoảng trắng, bỏ đường kẻ dính ở 2 đầu
     * - số thứ tự "12." / "12)" → "12" (để nhận là mốc dòng)
     * - cụm số (điện thoại, số giấy) bị đọc nhầm chữ: O/o → 0, l/I/| → 1, chỉ khi cụm đã có ≥ 3 chữ số thật
     * - khoảng trắng trước dấu câu, thiếu khoảng trắng sau dấu phẩy
     */
    public static function clean(string $text): string
    {
        if (class_exists(Normalizer::class)) {
            $text = Normalizer::normalize($text, Normalizer::FORM_C) ?: $text;
        }
        // Không dùng trim() với ký tự nhiều byte ("—"): trim cắt theo byte, làm hỏng chữ có dấu
        $text = (string) preg_replace(['/\s+/u', '/^[\s|¦_—–~]+|[\s|¦_—–~]+$/u'], [' ', ''], $text);
        if (preg_match('/^(\d{1,5})\s?[.,)]$/', $text, $m) === 1) {
            return $m[1];
        }
        $text = (string) preg_replace_callback('/(?<![\p{L}\p{N}])[0-9OoIl|]{4,}(?![\p{L}\p{N}])/u', function (array $m): string {
            return preg_match_all('/\d/', $m[0]) >= 3 ? strtr($m[0], ['O' => '0', 'o' => '0', 'I' => '1', 'l' => '1', '|' => '1']) : $m[0];
        }, $text);
        $text = (string) preg_replace('/\s+([,.;:)])/u', '$1', $text);
        $text = (string) preg_replace('/\(\s+/u', '(', $text);
        $text = (string) preg_replace('/,(?=\p{L})/u', ', ', $text);

        return trim($text);
    }

    private function bin(string $tool): string
    {
        return (string) config("shops.ocr.{$tool}", $tool);
    }

    private function lang(): string
    {
        return (string) config('shops.ocr.lang', 'vie');
    }

    private function dpi(): int
    {
        return max(72, (int) config('shops.ocr.dpi', 300));
    }

    /** Thư mục dữ liệu ngôn ngữ (TESSDATA_PREFIX), đường dẫn tương đối tính từ thư mục backend */
    private function tessdata(): ?string
    {
        $dir = config('shops.ocr.tessdata');
        if (! is_string($dir) || $dir === '') {
            return null;
        }

        return str_starts_with($dir, '/') ? $dir : base_path($dir);
    }

    /** @return array<string, string> */
    private function env(): array
    {
        // 1 luồng / tiến trình: tránh tesseract chiếm hết CPU của server
        return array_filter(['TESSDATA_PREFIX' => $this->tessdata(), 'OMP_THREAD_LIMIT' => '1']);
    }

    /**
     * Chạy lệnh kiểm tra; không chạy được (không có lệnh…) thì null. Trả về stdout + stderr (tesseract đời cũ in ra stderr).
     *
     * @param  list<string>  $command
     */
    private function run(array $command, int $timeout): ?string
    {
        try {
            $result = Process::timeout($timeout)->env($this->env())->run($command);
        } catch (Throwable) {
            return null;
        }

        return $result->exitCode() === 127 ? null : $result->output().$result->errorOutput();
    }

    /**
     * @param  list<string>  $command
     *
     * @throws RuntimeException
     */
    private function mustRun(array $command, string $tool): string
    {
        $result = Process::timeout((int) config('shops.ocr.timeout', 180))->env($this->env())->run($command);
        if ($result->failed()) {
            throw new RuntimeException("{$tool} lỗi (mã {$result->exitCode()}): ".Str::limit(trim($result->errorOutput()), 300));
        }

        return $result->output();
    }
}
