<?php

namespace App\Console\Commands;

use App\Http\Controllers\Api\V1\ReceiptPhotoController;
use App\Models\LedgerRecord;
use Carbon\CarbonImmutable;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

/**
 * Dọn ảnh hóa đơn thừa trên máy chủ, cùng quy tắc với máy (orphanPhotos ở packages/shared):
 * ảnh không còn khoản nào dùng (khoản đã xóa quá 1 ngày, hoặc khoản đã thay ảnh khác) và đã gửi lên quá 1 ngày.
 * Giữ 1 ngày để người dùng còn "Hoàn tác" khi lỡ xóa khoản.
 */
#[Signature('receipts:prune {--dry-run : Chỉ đếm, không xóa}')]
#[Description('Xóa ảnh hóa đơn không còn khoản thu chi nào dùng (sau 1 ngày)')]
class PruneReceiptPhotos extends Command
{
    public const GRACE_HOURS = 24;

    public function handle(): int
    {
        $disk = Storage::disk('local');
        $cutoff = CarbonImmutable::now()->subHours(self::GRACE_HOURS);
        $deleted = 0;
        $kept = 0;

        foreach ($disk->directories('receipts') as $directory) {
            $userId = (int) basename($directory);
            if ($directory !== ReceiptPhotoController::directory($userId)) {
                continue;
            }
            $files = $disk->files($directory);
            if ($files === []) {
                continue;
            }

            $keep = self::photosInUse($userId, $cutoff);
            foreach ($files as $path) {
                $id = strtolower(basename($path));
                if (isset($keep[$id]) || $disk->lastModified($path) > $cutoff->getTimestamp()) {
                    $kept++;

                    continue;
                }
                if (! $this->option('dry-run')) {
                    $disk->delete($path);
                }
                $deleted++;
            }
        }

        $this->info(($this->option('dry-run') ? 'Sẽ xóa' : 'Đã xóa')." {$deleted} ảnh thừa, giữ {$kept} ảnh.");

        return self::SUCCESS;
    }

    /**
     * Ảnh của khoản còn, hoặc khoản mới xóa trong 1 ngày (còn hoàn tác được).
     *
     * @return array<string, true>
     */
    private static function photosInUse(int $userId, CarbonImmutable $cutoff): array
    {
        $keep = [];
        $cutoffIso = $cutoff->utc()->format('Y-m-d\TH:i:s.u\Z');
        LedgerRecord::query()
            ->where('user_id', $userId)
            ->where('tbl', 'transactions')
            ->where(fn ($q) => $q->where('is_deleted', false)->orWhere('client_updated_at', '>=', $cutoffIso))
            ->select(['id', 'data'])
            ->chunkById(1000, function ($records) use (&$keep): void {
                foreach ($records as $record) {
                    $photo = $record->data['photo_id'] ?? null;
                    if (is_string($photo) && $photo !== '') {
                        $keep[strtolower($photo)] = true;
                    }
                }
            });

        return $keep;
    }
}
