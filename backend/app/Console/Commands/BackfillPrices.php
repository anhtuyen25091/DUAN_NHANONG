<?php

namespace App\Console\Commands;

use App\Crawling\BackfillRunner;
use App\Models\PriceSource;
use Carbon\CarbonImmutable;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Throwable;

#[Signature('crawl:backfill
    {sources?* : Mã nguồn có cấu hình backfill (vd baoquocte-ca-phe)}
    {--recent : Mọi nguồn có cấu hình backfill, chỉ tháng này (từ 3 ngày trước): bù ngày báo chính không đăng bài}
    {--from=2021-11 : Tháng bắt đầu (Y-m)}
    {--to= : Tháng kết thúc (Y-m), mặc định tháng này}
    {--keep-html : Lưu HTML bài vào crawl_logs (tốn dung lượng; mặc định không lưu)}')]
#[Description('Lấy dữ liệu giá cũ theo từng tháng (chạy lại được, bỏ qua bài đã lấy)')]
class BackfillPrices extends Command
{
    public function handle(BackfillRunner $runner): int
    {
        $recent = (bool) $this->option('recent');
        $from = $recent
            // Đầu tháng thì lấy cả tháng trước, để không sót bài đăng mấy ngày cuối tháng
            ? CarbonImmutable::today()->subDays(3)->startOfMonth()
            : CarbonImmutable::createFromFormat('Y-m-d', $this->option('from').'-01')->startOfMonth();
        $to = $this->option('to') ? CarbonImmutable::createFromFormat('Y-m-d', $this->option('to').'-01')->startOfMonth() : CarbonImmutable::today()->startOfMonth();

        $sources = PriceSource::query()
            ->when(
                $recent && $this->argument('sources') === [],
                fn ($query) => $query->whereNotNull('config->backfill'),
                fn ($query) => $query->whereIn('code', $this->argument('sources')),
            )
            ->orderBy('id')
            ->get();
        if ($sources->isEmpty()) {
            $this->error('Không tìm thấy nguồn.');

            return self::FAILURE;
        }

        // Theo thứ tự thời gian: phát hiện giá bất thường so với ngày trước đó
        $failedSources = 0;
        for ($month = $from; $month->lte($to); $month = $month->addMonth()) {
            foreach ($sources as $source) {
                try {
                    $stats = $runner->runMonth($source, $month, keepHtml: (bool) $this->option('keep-html'));
                } catch (Throwable $e) {
                    // 1 báo lỗi (mạng, đổi giao diện) thì vẫn chạy tiếp các báo khác
                    $failedSources++;
                    $this->warn(sprintf('%s %-20s lỗi: %s', $month->format('m/Y'), $source->code, $e->getMessage()));
                    report($e);

                    continue;
                }
                $this->line(sprintf(
                    '%s %-20s %3d bài, %3d đã có, lưu %4d giá, %d lỗi',
                    $month->format('m/Y'),
                    $source->code,
                    $stats['articles'],
                    $stats['done_before'],
                    $stats['imported'],
                    $stats['failed'],
                ));
            }
        }

        return $failedSources > 0 ? self::FAILURE : self::SUCCESS;
    }
}
