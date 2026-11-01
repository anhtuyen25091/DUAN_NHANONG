<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\NhanongPlan;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * Đăng nhập bằng email + mật khẩu, trả token Sanctum (gửi lại qua Authorization: Bearer).
 */
class AuthController extends Controller
{
    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'email', 'max:191', 'unique:users,email'],
            'password' => ['required', 'string', 'min:6', 'max:100'],
            'device_name' => ['nullable', 'string', 'max:100'],
        ], [
            'email.unique' => 'Email này đã có tài khoản. Hãy đăng nhập.',
            'password.min' => 'Mật khẩu cần ít nhất 6 ký tự.',
        ]);

        $user = User::query()->create(['name' => $data['name'], 'email' => strtolower($data['email']), 'password' => $data['password']]);

        return $this->tokenResponse($user, $data['device_name'] ?? null, 201);
    }

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'string', 'max:191'],
            'password' => ['required', 'string', 'max:100'],
            'device_name' => ['nullable', 'string', 'max:100'],
        ]);

        $user = User::query()->where('email', strtolower($data['email']))->first();
        if ($user === null || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages(['email' => 'Email hoặc mật khẩu không đúng.']);
        }

        return $this->tokenResponse($user, $data['device_name'] ?? null);
    }

    public function logout(Request $request): Response
    {
        $request->user()->currentAccessToken()->delete();

        return response()->noContent();
    }

    public function me(Request $request, NhanongPlan $plan): JsonResponse
    {
        $user = $request->user();
        $plan->refresh($user);

        return response()->json(['data' => ['id' => $user->id, 'name' => $user->name, 'email' => $user->email, 'plan' => $plan->summary($user)]]);
    }

    /**
     * Nối với tài khoản Nhà Nông (gửi token đăng nhập của app Nhà Nông) để dùng chung gói trả phí.
     */
    public function linkNhanong(Request $request, NhanongPlan $plan): JsonResponse
    {
        $data = $request->validate(['token' => ['required', 'string', 'max:255']]);

        try {
            $plan->link($request->user(), $data['token']);
        } catch (ConnectionException|RequestException $e) {
            report($e);

            return response()->json(['message' => 'Chưa kết nối được máy chủ Nhà Nông, thử lại sau.'], 503);
        }

        return response()->json(['data' => $plan->summary($request->user())]);
    }

    public function unlinkNhanong(Request $request, NhanongPlan $plan): JsonResponse
    {
        $plan->unlink($request->user());

        return response()->json(['data' => $plan->summary($request->user())]);
    }

    private function tokenResponse(User $user, ?string $deviceName, int $status = 200): JsonResponse
    {
        $token = $user->createToken($deviceName ?: 'app')->plainTextToken;

        return response()->json(['token' => $token, 'user' => ['id' => $user->id, 'name' => $user->name, 'email' => $user->email]], $status);
    }
}
