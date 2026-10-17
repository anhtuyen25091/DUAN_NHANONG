<?php

namespace App\Notifications;

use App\Alerts\ExpoPushClient;
use App\Models\Device;
use App\Realtime\Realtime;

use function Illuminate\Support\defer;

/**
 * Báo việc mới tới tài khoản: tin Ably (app đang mở thì tải lại ngay) + thông báo đẩy (mọi máy đang đăng nhập tài khoản đó và đã bật thông báo), để báo cả khi app đóng:
 * bên kia ghi / xác nhận / báo sai trong đơn mua bán, khách nhận phiếu mới hoặc phiếu bị sửa.
 * Gửi sau khi trả lời request (không làm chậm người đang thao tác).
 */
class PushNotifier
{
    public const CHANNEL = 'updates';

    public function __construct(private ExpoPushClient $client) {}

    /**
     * @param  iterable<int>  $userIds
     * @param  array<string, mixed>  $data  app dùng để mở đúng màn hình khi bấm vào thông báo
     */
    public static function later(iterable $userIds, string $title, string $body, array $data = []): void
    {
        $ids = collect($userIds)->filter()->unique()->values()->all();
        if ($ids === []) {
            return;
        }
        defer(function () use ($ids, $title, $body, $data): void {
            // App đang mở: tin Ably để tải lại ngay; app đóng: thông báo đẩy
            app(Realtime::class)->publish($ids, ['title' => $title, ...$data]);
            app(self::class)->send($ids, $title, $body, $data);
        });
    }

    /**
     * @param  list<int>  $userIds
     * @param  array<string, mixed>  $data
     */
    public function send(array $userIds, string $title, string $body, array $data = []): int
    {
        $devices = Device::query()->whereIn('user_id', $userIds)->whereNotNull('push_token')->get();

        return $this->client->send($devices->map(fn (Device $device): array => [
            'device' => $device,
            'title' => mb_substr($title, 0, 80),
            'body' => mb_substr($body, 0, 180),
            'data' => $data,
            'channel' => self::CHANNEL,
        ])->all());
    }
}
