<?php

namespace App\Notifications;

use App\Models\PushToken;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Gửi thông báo đẩy qua Expo Push API (Expo chuyển tiếp sang FCM/APNs). Cùng cách với backend/.
 */
class ExpoPushClient
{
    private const ENDPOINT = 'https://exp.host/--/api/v2/push/send';

    private const CHUNK = 100;

    /** Kênh thông báo Android (app tạo sẵn) cho cảnh báo cảm biến */
    public const CHANNEL = 'iot-alerts';

    /**
     * @param  iterable<PushToken>  $tokens
     * @param  array<string, mixed>  $data  app dùng để mở đúng màn hình khi bấm vào thông báo
     * @return int số tin Expo nhận
     */
    public function send(iterable $tokens, string $title, string $body, array $data = []): int
    {
        $accepted = 0;

        foreach (collect($tokens)->chunk(self::CHUNK) as $chunk) {
            $chunk = $chunk->values();
            $payload = $chunk->map(fn (PushToken $token): array => [
                'to' => $token->token,
                'title' => mb_substr($title, 0, 80),
                'body' => mb_substr($body, 0, 180),
                'data' => $data ?: (object) [],
                'sound' => 'default',
                'priority' => 'high',
                'channelId' => self::CHANNEL,
            ])->all();

            try {
                $tickets = Http::acceptJson()
                    ->when(config('services.expo.access_token'), fn ($request, string $token) => $request->withToken($token))
                    ->connectTimeout(5)
                    ->timeout(20)
                    ->retry([1000, 4000], 0, fn (Throwable $e): bool => $e instanceof ConnectionException
                        || ($e instanceof RequestException && ($e->response->serverError() || $e->response->status() === 429)))
                    ->post(self::ENDPOINT, $payload)
                    ->throw()
                    ->json('data', []);
            } catch (Throwable $e) {
                report($e);

                continue;
            }

            foreach ($tickets as $index => $ticket) {
                if (($ticket['status'] ?? null) === 'ok') {
                    $accepted++;
                } elseif (($ticket['details']['error'] ?? null) === 'DeviceNotRegistered') {
                    // Máy đã gỡ app hoặc tắt thông báo: không gửi nữa
                    $chunk[$index]?->delete();
                } else {
                    Log::warning('Expo push lỗi', ['ticket' => $ticket]);
                }
            }
        }

        return $accepted;
    }
}
