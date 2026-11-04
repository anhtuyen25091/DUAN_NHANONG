<?php

namespace App\Console\Commands;

use App\Media\MediaLibrary;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('media:sync')]
#[Description('Quét ổ public: đưa file chưa có vào Thư viện ảnh, bỏ bản ghi file đã mất, tính lại chỗ đang dùng')]
class SyncMediaLibrary extends Command
{
    public function handle(MediaLibrary $library): int
    {
        $result = $library->syncFromDisk();
        $this->info("Thêm {$result['added']} file, bỏ {$result['removed']} bản ghi file đã mất. Thư viện có {$result['total']} file.");

        return self::SUCCESS;
    }
}
