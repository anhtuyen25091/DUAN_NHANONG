<?php

namespace App\Console\Commands;

use App\Shops\Collect\ShopCollector;
use App\Shops\Collect\ShopSource;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Throwable;

#[Signature('shops:collect {sources?* : Khóa nguồn trong config/shops.php; để trống là tất cả} {--no-process : Chỉ lưu vào bảng chờ, chưa xử lý}')]
#[Description('Thu thập điểm bán từ các nguồn vào bảng chờ, rồi xử lý (lấy tọa độ, bỏ trùng, tự đưa vào danh sách khi đủ tin cậy)')]
class CollectShops extends Command
{
    public function handle(ShopCollector $collector): int
    {
        $configured = (array) config('shops.sources');
        $keys = $this->argument('sources') ?: array_keys($configured);
        $failed = false;

        foreach ($keys as $key) {
            if (! isset($configured[$key])) {
                $this->error("Không có nguồn \"{$key}\". Các nguồn: ".implode(', ', array_keys($configured)));
                $failed = true;

                continue;
            }
            /** @var ShopSource $source */
            $source = app($configured[$key]);

            // 1 nguồn lỗi không làm dừng các nguồn khác
            try {
                $counts = $collector->collect($source);
                $this->info("{$source->label()}: mới {$counts['new']}, cập nhật {$counts['updated']}, bỏ qua {$counts['skipped']}.");
                if (! $this->option('no-process')) {
                    $result = $collector->process($key);
                    $this->line("  Đưa vào danh sách {$result['published']}, chờ duyệt {$result['pending']}, để lần sau (lỗi tra tọa độ) {$result['deferred']}.");
                }
            } catch (Throwable $e) {
                report($e);
                $this->error("{$source->label()}: lỗi {$e->getMessage()}");
                $failed = true;
            }
        }

        return $failed ? self::FAILURE : self::SUCCESS;
    }
}
