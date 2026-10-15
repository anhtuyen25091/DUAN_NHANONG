<?php

namespace App\Alerts;

use App\Models\Device;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Gửi thông báo đẩy qua Expo Push API (Expo chuyển tiếp sang FCM/APNs).
 */
class ExpoPushClient
{
    private const ENDPOINT = 'https://exp.host/--/api/v2/push/send';

    private const CHUNK = 100;

    /**
     * @param  list<array{device: Device, title: string, body: string, data?: array<string, mixed>}>  $messages
     * @return int số tin Expo nhận
     */
    public function send(array $messages): int
    {
        $accepted = 0;

        foreach (array_chunk($messages, self::CHUNK) as $chunk) {
            $payload = array_map(fn (array $message): array => [
                'to' => $message['device']->push_token,
                'title' => $message['title'],
                'body' => $message['body'],
                'data' => $message['data'] ?? (object) [],
                'sound' => 'default',
                'channelId' => 'price-alerts',
            ], $chunk);

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

                    continue;
                }

                if (($ticket['details']['error'] ?? null) === 'DeviceNotRegistered') {
                    // Máy đã gỡ app hoặc tắt thông báo: không gửi nữa
                    $chunk[$index]['device']->update(['push_token' => null]);
                } else {
                    Log::warning('Expo push lỗi', ['ticket' => $ticket]);
                }
            }
        }

        return $accepted;
    }
}
