<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\PriceAccess;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * Đăng nhập bằng số điện thoại + mật khẩu, trả token Sanctum (app/web gửi lại qua Authorization: Bearer).
 * Chỉ cần khi người dùng chọn "lưu cả trên mạng".
 */
class AuthController extends Controller
{
    public function register(Request $request): JsonResponse
    {
        $request->merge(['phone' => User::normalizePhone($request->input('phone')) ?? $request->input('phone')]);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'phone' => ['required', 'regex:/^0[1-9]\d{8}$/', 'unique:users,phone'],
            'password' => ['required', 'string', 'min:6', 'max:100'],
            'device_name' => ['nullable', 'string', 'max:100'],
        ], [
            'phone.regex' => 'Số điện thoại chưa đúng (10 số, bắt đầu bằng 0).',
            'phone.unique' => 'Số điện thoại này đã có tài khoản. Hãy đăng nhập.',
            'password.min' => 'Mật khẩu cần ít nhất 6 ký tự.',
        ]);

        $user = User::query()->create(['name' => $data['name'], 'phone' => $data['phone'], 'password' => $data['password']]);

        return $this->tokenResponse($user, $data['device_name'] ?? null, 201);
    }

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'phone' => ['required', 'string', 'max:20'],
            'password' => ['required', 'string', 'max:100'],
            'device_name' => ['nullable', 'string', 'max:100'],
        ]);

        $user = User::query()->where('phone', User::normalizePhone($data['phone']))->first();
        if ($user === null || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages(['phone' => 'Số điện thoại hoặc mật khẩu không đúng.']);
        }

        return $this->tokenResponse($user, $data['device_name'] ?? null);
    }

    public function logout(Request $request): Response
    {
        $request->user()->currentAccessToken()->delete();

        return response()->noContent();
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['data' => self::userData($request->user())]);
    }

    private function tokenResponse(User $user, ?string $deviceName, int $status = 200): JsonResponse
    {
        $token = $user->createToken($deviceName ?: 'app', ['ledger'])->plainTextToken;

        return response()->json(['token' => $token, 'user' => self::userData($user)], $status);
    }

    /**
     * @return array{id: int, name: string, phone: ?string, tier: string, premium_until: ?string}
     */
    private static function userData(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'phone' => $user->phone,
            'tier' => PriceAccess::tier($user),
            'premium_until' => $user->premium_until?->toDateString(),
        ];
    }
}
