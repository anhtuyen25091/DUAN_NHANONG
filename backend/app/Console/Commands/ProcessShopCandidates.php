<?php

namespace App\Console\Commands;

use App\Enums\CandidateStatus;
use App\Models\ShopCandidate;
use App\Shops\Collect\ShopCollector;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('shops:process {--source= : Chỉ xử lý 1 nguồn} {--limit=0 : Tối đa bao nhiêu điểm (0 = tất cả)} {--retry : Xử lý lại cả các điểm đang chờ admin (vd sau khi đổi ngưỡng tin cậy)}')]
#[Description('Xử lý các điểm bán thu thập đang chờ: lấy tọa độ, bỏ trùng, tự đưa vào danh sách khi đủ tin cậy')]
class ProcessShopCandidates extends Command
{
    public function handle(ShopCollector $collector): int
    {
        if ($this->option('retry')) {
            ShopCandidate::query()
                ->where('status', CandidateStatus::Pending)
                ->when($this->option('source'), fn ($q, $source) => $q->where('source', $source))
                ->update(['review_note' => null]);
        }
        $result = $collector->process($this->option('source') ?: null, (int) $this->option('limit'));
        $this->info("Đưa vào danh sách {$result['published']}, chờ duyệt {$result['pending']}, để lần sau (lỗi tra tọa độ) {$result['deferred']}.");

        return self::SUCCESS;
    }
}
