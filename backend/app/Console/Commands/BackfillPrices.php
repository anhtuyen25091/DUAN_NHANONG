<?php

namespace App\Console\Commands;

use App\Crawling\BackfillRunner;
use App\Models\PriceSource;
use Carbon\CarbonImmutable;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('crawl:backfill
    {sources* : Mã nguồn có cấu hình backfill (vd baoquocte-ca-phe)}
    {--from=2021-11 : Tháng bắt đầu (Y-m)}
    {--to= : Tháng kết thúc (Y-m), mặc định tháng này}
    {--keep-html : Lưu HTML bài vào crawl_logs (tốn dung lượng; mặc định không lưu)}')]
#[Description('Lấy dữ liệu giá cũ theo từng tháng (chạy lại được, bỏ qua bài đã lấy)')]
class BackfillPrices extends Command
{
    public function handle(BackfillRunner $runner): int
    {
        $from = CarbonImmutable::createFromFormat('Y-m-d', $this->option('from').'-01')->startOfMonth();
        $to = $this->option('to') ? CarbonImmutable::createFromFormat('Y-m-d', $this->option('to').'-01')->startOfMonth() : CarbonImmutable::today()->startOfMonth();

        $sources = PriceSource::query()->whereIn('code', $this->argument('sources'))->orderBy('id')->get();
        if ($sources->isEmpty()) {
            $this->error('Không tìm thấy nguồn.');

            return self::FAILURE;
        }

        // Theo thứ tự thời gian: phát hiện giá bất thường so với ngày trước đó
        for ($month = $from; $month->lte($to); $month = $month->addMonth()) {
            foreach ($sources as $source) {
                $stats = $runner->runMonth($source, $month, keepHtml: (bool) $this->option('keep-html'));
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

        return self::SUCCESS;
    }
}
