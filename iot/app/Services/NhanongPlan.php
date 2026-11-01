<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * Dùng chung gói trả phí với app Nhà Nông: tài khoản cảm biến nối với tài khoản Nhà Nông (token Sanctum của backend),
 * máy chủ cảm biến hỏi backend GET /api/v1/user để biết mức gói. Kết quả giữ lại vài giờ.
 */
class NhanongPlan
{
    /**
     * @throws ValidationException token không dùng được / tài khoản Nhà Nông đã nối với tài khoản cảm biến khác
     */
    public function link(User $user, string $token): void
    {
        $account = $this->fetch($token);
        if ($account === null) {
            throw ValidationException::withMessages(['token' => 'Phiên đăng nhập Nhà Nông đã hết hạn. Đăng nhập lại tài khoản Nhà Nông rồi thử lại.']);
        }

        $taken = User::query()->where('nhanong_user_id', $account['id'])->whereKeyNot($user->id)->exists();
        if ($taken) {
            throw ValidationException::withMessages(['token' => 'Tài khoản Nhà Nông này đã nối với một tài khoản cảm biến khác.']);
        }

        $user->forceFill(['nhanong_user_id' => $account['id'], 'nhanong_token' => $token])->save();
        $this->store($user, $account);
    }

    public function unlink(User $user): void
    {
        $user->forceFill([
            'nhanong_user_id' => null,
            'nhanong_phone' => null,
            'nhanong_token' => null,
            'nhanong_tier' => null,
            'premium_until' => null,
            'plan_checked_at' => null,
        ])->save();
    }

    /**
     * Hỏi lại backend khi kết quả cũ hơn plan_cache_hours. Backend không trả lời được thì giữ kết quả cũ;
     * token bị thu hồi (đăng xuất Nhà Nông) thì coi như chưa có gói, giữ nối để lần đăng nhập sau nối lại.
     */
    public function refresh(User $user, bool $force = false): void
    {
        if ($user->nhanong_token === null) {
            return;
        }
        if (! $force && $user->plan_checked_at?->gt(now()->subHours(config('iot.nhanong.plan_cache_hours')))) {
            return;
        }

        try {
            $account = $this->fetch($user->nhanong_token);
        } catch (Throwable $e) {
            report($e);

            return;
        }

        if ($account === null) {
            $user->forceFill(['nhanong_token' => null, 'nhanong_tier' => null, 'premium_until' => null, 'plan_checked_at' => now()])->save();

            return;
        }
        $this->store($user, $account);
    }

    /**
     * @return array{linked: bool, phone: ?string, premium: bool, premium_until: ?string, rain_history_days: int}
     */
    public function summary(User $user): array
    {
        return [
            'linked' => $user->nhanong_user_id !== null && $user->nhanong_token !== null,
            'phone' => $user->nhanong_phone,
            'premium' => $user->hasPremium(),
            'premium_until' => $user->premium_until?->toDateString(),
            'rain_history_days' => $user->rainHistoryDays(),
        ];
    }

    /**
     * @return array{id: int, phone: ?string, tier: string, premium_until: ?string}|null null = token không dùng được
     *
     * @throws ConnectionException
     */
    private function fetch(string $token): ?array
    {
        $response = Http::acceptJson()
            ->withToken($token)
            ->connectTimeout(5)
            ->timeout(10)
            ->get(rtrim(config('iot.nhanong.api_url'), '/').'/api/v1/user');

        if ($response->status() === 401) {
            return null;
        }
        $response->throw();

        return $response->json('data');
    }

    /**
     * @param  array{phone: ?string, tier: string, premium_until: ?string}  $account
     */
    private function store(User $user, array $account): void
    {
        $user->forceFill([
            'nhanong_phone' => $account['phone'] ?? null,
            'nhanong_tier' => $account['tier'] ?? null,
            'premium_until' => $account['premium_until'] ?? null,
            'plan_checked_at' => now(),
        ])->save();
    }
}
