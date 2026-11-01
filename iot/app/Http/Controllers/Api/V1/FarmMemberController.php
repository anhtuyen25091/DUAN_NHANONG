<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Farm;
use App\Models\FarmMember;
use App\Models\User;
use App\Support\Ownership;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

/**
 * Chia sẻ trang trại cho người nhà / người làm công (đã có tài khoản cảm biến).
 * Chủ trang trại mời bằng email, đổi vai trò, bỏ chia sẻ; người được chia sẻ tự rời được.
 */
class FarmMemberController extends Controller
{
    public function index(Request $request, Farm $farm): JsonResponse
    {
        Ownership::farm($request, $farm, Ownership::VIEW);
        $farm->load(['user', 'members.user']);

        return response()->json(['data' => [
            ['id' => null, 'user_id' => $farm->user_id, 'name' => $farm->user->name, 'email' => $farm->user->email, 'role' => 'owner'],
            ...$farm->members->sortBy('created_at')->map(fn (FarmMember $member) => $this->present($member))->values(),
        ]]);
    }

    public function store(Request $request, Farm $farm): JsonResponse
    {
        Ownership::farm($request, $farm);
        $data = $request->validate([
            'email' => ['required', 'email'],
            'role' => ['required', Rule::in(FarmMember::ROLES)],
        ], [
            'email.required' => 'Nhập email tài khoản cảm biến của người được chia sẻ.',
        ]);

        $user = User::query()->where('email', mb_strtolower(trim($data['email'])))->first();
        abort_if($user === null, 422, 'Chưa có tài khoản cảm biến với email này. Nhờ người đó đăng ký trong app Nhà Nông (mục 📡 Cảm biến) trước.');
        abort_if($user->id === $farm->user_id, 422, 'Đây là tài khoản chủ trang trại.');

        $member = FarmMember::query()->updateOrCreate(['farm_id' => $farm->id, 'user_id' => $user->id], ['role' => $data['role']]);

        return response()->json(['data' => $this->present($member->load('user'))], $member->wasRecentlyCreated ? 201 : 200);
    }

    public function update(Request $request, FarmMember $member): JsonResponse
    {
        Ownership::farm($request, $member->farm);
        $member->update($request->validate(['role' => ['required', Rule::in(FarmMember::ROLES)]]));

        return response()->json(['data' => $this->present($member->load('user'))]);
    }

    /**
     * Chủ bỏ chia sẻ, hoặc người được chia sẻ tự rời trang trại.
     */
    public function destroy(Request $request, FarmMember $member): Response
    {
        if ($member->user_id !== $request->user()->id) {
            Ownership::farm($request, $member->farm);
        }
        $member->delete();

        return response()->noContent();
    }

    /**
     * @return array{id: int, user_id: int, name: string, email: string, role: string}
     */
    private function present(FarmMember $member): array
    {
        return ['id' => $member->id, 'user_id' => $member->user_id, 'name' => $member->user->name, 'email' => $member->user->email, 'role' => $member->role];
    }
}
