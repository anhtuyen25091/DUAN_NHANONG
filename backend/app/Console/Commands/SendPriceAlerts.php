<?php

namespace App\Console\Commands;

use App\Alerts\PriceAlertEvaluator;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('alerts:send')]
#[Description('Kiểm tra cảnh báo giá và gửi thông báo đẩy')]
class SendPriceAlerts extends Command
{
    public function handle(PriceAlertEvaluator $evaluator): int
    {
        $sent = $evaluator->run();
        $this->info("Đã gửi {$sent} thông báo.");

        return self::SUCCESS;
    }
}
