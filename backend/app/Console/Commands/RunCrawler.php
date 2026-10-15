<?php

namespace App\Console\Commands;

use App\Crawling\CrawlRunner;
use App\Jobs\RunPriceSource;
use App\Models\PriceSource;
use Carbon\CarbonImmutable;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('crawl:run
    {sources?* : Mã nguồn (vd vietbao-ho-tieu); bỏ trống = mọi nguồn đang bật}
    {--date= : Ngày cần lấy (Y-m-d), mặc định hôm nay}
    {--queue : Đưa vào hàng đợi thay vì chạy ngay}')]
#[Description('Thu thập giá từ các nguồn')]
class RunCrawler extends Command
{
    public function handle(CrawlRunner $runner): int
    {
        $date = CarbonImmutable::parse($this->option('date') ?? 'today')->startOfDay();
        $codes = $this->argument('sources');

        $sources = PriceSource::query()
            ->when($codes, fn ($query) => $query->whereIn('code', $codes), fn ($query) => $query->where('is_enabled', true))
            ->orderBy('id')
            ->get();

        if ($sources->isEmpty()) {
            $this->warn('Không có nguồn nào để chạy.');

            return self::FAILURE;
        }

        foreach ($sources as $source) {
            if ($this->option('queue')) {
                RunPriceSource::dispatch($source, $date->toDateString());
                $this->line("Đã đưa vào hàng đợi: {$source->code}");

                continue;
            }

            $status = $runner->run($source, $date);
            $lastLog = $source->crawlLogs()->latest('id')->first();
            $this->line(sprintf('%-22s %-12s %s', $source->code, $status->getLabel(), $lastLog?->message));
        }

        return self::SUCCESS;
    }
}
