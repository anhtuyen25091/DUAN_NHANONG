<?php

namespace Tests\Feature;

use App\Models\LedgerRecord;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

class PruneReceiptPhotosTest extends TestCase
{
    use RefreshDatabase;

    public function test_deletes_only_photos_no_transaction_uses_after_one_day(): void
    {
        Storage::fake('local');
        $user = User::factory()->create();
        $disk = Storage::disk('local');
        $dir = "receipts/{$user->id}";
        $old = now()->subDays(2)->getTimestamp();
        $iso = fn ($time) => $time->utc()->format('Y-m-d\TH:i:s.u\Z');

        $photos = [];
        foreach (['dung', 'xoa-lau', 'xoa-vua-xong', 'da-thay', 'vua-gui'] as $name) {
            $photos[$name] = (string) Str::uuid();
            $disk->put("$dir/{$photos[$name]}", 'jpg');
            if ($name !== 'vua-gui') {
                touch($disk->path("$dir/{$photos[$name]}"), $old);
            }
        }

        $tx = function (?string $photo, bool $deleted, $updatedAt) use ($user, $iso): void {
            $id = (string) Str::uuid();
            LedgerRecord::query()->create([
                'user_id' => $user->id, 'tbl' => 'transactions', 'uuid' => $id, 'version' => 1,
                'data' => ['id' => $id, 'photo_id' => $photo, 'updated_at' => $iso($updatedAt), 'deleted_at' => $deleted ? $iso($updatedAt) : null],
                'client_updated_at' => $iso($updatedAt), 'is_deleted' => $deleted,
            ]);
        };
        $tx($photos['dung'], false, now()->subDays(5));
        $tx($photos['xoa-lau'], true, now()->subDays(3));
        $tx($photos['xoa-vua-xong'], true, now()->subMinutes(5));
        // 'da-thay': không khoản nào trỏ tới nữa; 'vua-gui': vừa gửi lên, chưa có khoản

        // Người khác có khoản trỏ tới ảnh 'xoa-lau' cũng không giữ ảnh của người này
        $other = User::factory()->create();
        LedgerRecord::query()->create([
            'user_id' => $other->id, 'tbl' => 'transactions', 'uuid' => (string) Str::uuid(), 'version' => 1,
            'data' => ['photo_id' => $photos['xoa-lau']], 'client_updated_at' => $iso(now()), 'is_deleted' => false,
        ]);

        $this->artisan('receipts:prune --dry-run')->expectsOutputToContain('Sẽ xóa 2 ảnh thừa, giữ 3 ảnh.')->assertSuccessful();
        $this->assertCount(5, $disk->files($dir));

        $this->artisan('receipts:prune')->expectsOutputToContain('Đã xóa 2 ảnh thừa')->assertSuccessful();
        $disk->assertMissing("$dir/{$photos['xoa-lau']}");
        $disk->assertMissing("$dir/{$photos['da-thay']}");
        $disk->assertExists("$dir/{$photos['dung']}");
        $disk->assertExists("$dir/{$photos['xoa-vua-xong']}");
        $disk->assertExists("$dir/{$photos['vua-gui']}");
    }
}
