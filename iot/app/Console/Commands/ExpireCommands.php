<?php

namespace App\Console\Commands;

use App\Services\Control\CommandService;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('commands:expire')]
#[Description('Hủy lệnh bật / tắt mà mạch điều khiển không nhận kịp (mất điện / mất mạng), báo chủ trang trại; tắt máy LoRaWAN hết giờ chạy')]
class ExpireCommands extends Command
{
    public function handle(CommandService $commands): int
    {
        $this->info('Lệnh quá hạn: '.$commands->expire());
        $this->info('Tắt máy LoRaWAN hết giờ: '.$commands->autoOff());

        return self::SUCCESS;
    }
}
