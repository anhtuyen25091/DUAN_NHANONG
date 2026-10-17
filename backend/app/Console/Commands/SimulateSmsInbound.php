<?php

namespace App\Console\Commands;

use App\Auth\PhoneVerifier;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

/** Chạy thử trên máy dev khi chưa có thiết bị nhận SMS: php artisan sms:inbound 0912345678 "NN 482913" */
#[Signature('sms:inbound {from : Số gửi} {text : Nội dung tin}')]
#[Description('Giả lập 1 tin SMS đến (thay cho thiết bị / dịch vụ nhận SMS) để thử quên mật khẩu')]
class SimulateSmsInbound extends Command
{
    public function handle(PhoneVerifier $verifier): int
    {
        $verification = $verifier->receive((string) $this->argument('from'), (string) $this->argument('text'));
        $this->info($verification ? "Đã xác minh số {$verification->phone}." : 'Không khớp yêu cầu nào đang chờ (sai số / sai mã / hết hạn).');

        return self::SUCCESS;
    }
}
