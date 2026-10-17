<?php

namespace App\Realtime;

use Ably\AblyRest;
use App\Models\User;
use Throwable;

/**
 * Cập nhật tức thì qua Ably (gói miễn phí: 200 kết nối cùng lúc, 6 triệu tin / tháng).
 * Mỗi tài khoản 1 kênh riêng "user:{id}": có việc mới (đơn mua bán, phiếu) thì gửi 1 tin "update",
 * app nhận tin thì tải lại ngay. App chỉ nghe được kênh của mình (vé tạm do máy chủ cấp, không lộ khóa Ably).
 * Không cấu hình ABLY_KEY, Ably lỗi hay hết lượt kết nối: app tự quay về hỏi máy chủ 8 giây / lần như cũ.
 */
class Realtime
{
    private ?AblyRest $client = null;

    public function enabled(): bool
    {
        return (string) config('services.ably.key') !== '';
    }

    public static function channel(int $userId): string
    {
        return "user:{$userId}";
    }

    /**
     * @param  list<int>  $userIds
     * @param  array<string, mixed>  $data
     */
    public function publish(array $userIds, array $data): void
    {
        if (! $this->enabled()) {
            return;
        }
        foreach ($userIds as $id) {
            try {
                $this->client()->channels->get(self::channel($id))->publish('update', $data);
            } catch (Throwable $e) {
                // Mất tin thì app vẫn tự hỏi lại máy chủ định kỳ
                report($e);
            }
        }
    }

    /**
     * Vé tạm (1 giờ) cho app: chỉ được nghe kênh của chính mình.
     *
     * @return array<string, mixed>
     */
    public function tokenRequest(User $user): array
    {
        return $this->client()->auth->createTokenRequest([
            'clientId' => (string) $user->id,
            'capability' => json_encode([self::channel($user->id) => ['subscribe']]),
            'ttl' => 3600 * 1000,
        ])->toArray();
    }

    private function client(): AblyRest
    {
        return $this->client ??= new AblyRest((string) config('services.ably.key'));
    }
}
