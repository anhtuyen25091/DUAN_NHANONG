<?php

namespace App\Http\Controllers\Api\V1;

use App\Businesses\BusinessStats;
use App\Deals\DealSummary;
use App\Http\Controllers\Controller;
use App\Models\Business;
use App\Models\BusinessAdvance;
use App\Models\BusinessMember;
use App\Models\Deal;
use App\Models\User;
use App\Transactions\TransactionFeed;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Doanh nghiệp thu mua: chủ tạo doanh nghiệp, tạo tài khoản con / gửi mã mời cho lái,
 * ứng tiền cho lái, xem thống kê từng lái. Lái xem tiền mình đang giữ.
 */
class BusinessController extends Controller
{
    /** Doanh nghiệp của mình (chủ hoặc lái); chưa tham gia thì data = null */
    public function show(Request $request): JsonResponse
    {
        $membership = $request->user()->membership()->with('business.owner')->first();

        return response()->json(['data' => $membership ? $this->present($membership) : null]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        if ($user->membership()->exists()) {
            throw ValidationException::withMessages(['name' => 'Tài khoản này đã thuộc 1 doanh nghiệp.']);
        }
        $data = $this->validatedInfo($request);

        $membership = DB::transaction(function () use ($user, $data): BusinessMember {
            $business = new Business($data);
            $business->owner_id = $user->id;
            $business->save();

            return $business->members()->create(['user_id' => $user->id, 'role' => BusinessMember::OWNER, 'status' => BusinessMember::ACTIVE]);
        });

        return response()->json(['data' => $this->present($membership->load('business.owner'))], 201);
    }

    public function update(Request $request): JsonResponse
    {
        $business = $this->ownedBusiness($request);
        $business->update($this->validatedInfo($request));

        return $this->show($request);
    }

    /** Chủ tạo thẳng tài khoản cho lái (SĐT + mật khẩu ban đầu); lái đăng nhập là dùng được */
    public function createMember(Request $request): JsonResponse
    {
        $business = $this->ownedBusiness($request);
        $request->merge(['phone' => User::normalizePhone($request->input('phone')) ?? $request->input('phone')]);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'phone' => ['required', 'regex:/^0[1-9]\d{8}$/', 'unique:users,phone'],
            'password' => ['required', 'string', 'min:6', 'max:100'],
            'group_name' => ['nullable', 'string', 'max:80'],
        ], [
            'phone.regex' => 'Số điện thoại chưa đúng (10 số, bắt đầu bằng 0).',
            'phone.unique' => 'Số này đã có tài khoản Nhà Nông. Hãy gửi mã mời để người đó tự tham gia.',
            'password.min' => 'Mật khẩu cần ít nhất 6 ký tự.',
        ]);

        $member = DB::transaction(function () use ($business, $data): BusinessMember {
            $user = User::query()->create(['name' => $data['name'], 'phone' => $data['phone'], 'password' => $data['password']]);

            return $business->members()->create([
                'user_id' => $user->id, 'role' => BusinessMember::BUYER, 'status' => BusinessMember::ACTIVE,
                'group_name' => $data['group_name'] ?? null, 'created_by_owner' => true,
            ]);
        });

        return response()->json(['data' => BusinessStats::member($member->load('user'))], 201);
    }

    /** Đổi nhóm, khóa / mở khóa, đặt lại mật khẩu (chỉ tài khoản chủ đã tạo) */
    public function updateMember(Request $request, User $user): JsonResponse
    {
        $member = $this->memberOf($this->ownedBusiness($request), $user);
        $data = $request->validate([
            'group_name' => ['sometimes', 'nullable', 'string', 'max:80'],
            'status' => ['sometimes', Rule::in([BusinessMember::ACTIVE, BusinessMember::LOCKED])],
            'password' => ['sometimes', 'string', 'min:6', 'max:100'],
        ], ['password.min' => 'Mật khẩu cần ít nhất 6 ký tự.']);

        if ($member->role === BusinessMember::OWNER && isset($data['status'])) {
            throw ValidationException::withMessages(['status' => 'Không khóa được tài khoản chủ.']);
        }
        if (isset($data['password'])) {
            if (! $member->created_by_owner) {
                throw ValidationException::withMessages(['password' => 'Lái này tự đăng ký tài khoản, chỉ họ đổi được mật khẩu.']);
            }
            $user->forceFill(['password' => $data['password']])->save();
            // Đổi mật khẩu thì đăng xuất các máy đang dùng tài khoản này
            $user->tokens()->delete();
        }
        if (($data['status'] ?? null) === BusinessMember::LOCKED) {
            $user->tokens()->delete();
        }
        $member->update(collect($data)->only(['group_name', 'status'])->all());

        return response()->json(['data' => BusinessStats::member($member->load('user'))]);
    }

    /** Gỡ lái khỏi doanh nghiệp: phiếu, đơn, tiền ứng cũ vẫn thuộc doanh nghiệp */
    public function removeMember(Request $request, User $user): Response
    {
        $member = $this->memberOf($this->ownedBusiness($request), $user);
        if ($member->role === BusinessMember::OWNER) {
            throw ValidationException::withMessages(['user' => 'Không gỡ được tài khoản chủ.']);
        }
        $member->delete();

        return response()->noContent();
    }

    /** Tạo (hoặc lấy lại) mã mời cho lái đã có tài khoản */
    public function invite(Request $request): JsonResponse
    {
        $business = $this->ownedBusiness($request);
        if ($business->invite_code === null) {
            $business->forceFill(['invite_code' => Deal::newCode()])->save();
        }

        return $this->show($request);
    }

    public function revokeInvite(Request $request): JsonResponse
    {
        $this->ownedBusiness($request)->forceFill(['invite_code' => null])->save();

        return $this->show($request);
    }

    /** Lái nhập mã mời để vào doanh nghiệp */
    public function join(Request $request): JsonResponse
    {
        $code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) $request->validate(['code' => ['required', 'string', 'max:20']])['code']));
        $user = $request->user();
        $business = Business::query()->where('invite_code', $code)->first();
        if ($business === null) {
            throw ValidationException::withMessages(['code' => 'Không tìm thấy doanh nghiệp với mã này. Kiểm tra lại mã.']);
        }
        if ($user->membership()->exists()) {
            throw ValidationException::withMessages(['code' => 'Tài khoản này đã thuộc 1 doanh nghiệp. Rời doanh nghiệp cũ trước.']);
        }
        $business->members()->create(['user_id' => $user->id, 'role' => BusinessMember::BUYER, 'status' => BusinessMember::ACTIVE]);

        return $this->show($request);
    }

    /** Lái tự rời doanh nghiệp (chủ thì không rời được) */
    public function leave(Request $request): Response
    {
        $membership = $request->user()->membership()->firstOrFail();
        if ($membership->role === BusinessMember::OWNER) {
            throw ValidationException::withMessages(['user' => 'Chủ doanh nghiệp không rời được.']);
        }
        $membership->delete();

        return response()->noContent();
    }

    /** Thống kê cho chủ: từng lái (mua / bán trong khoảng ngày, tiền đang giữ), cả doanh nghiệp, theo mặt hàng */
    public function summary(Request $request): JsonResponse
    {
        $business = $this->ownedBusiness($request);
        [$from, $to] = TransactionController::dateRange($request);

        return response()->json(['data' => BusinessStats::summary($business, $from, $to), 'meta' => ['from' => $from->toDateString(), 'to' => $to->toDateString()]]);
    }

    /** Sổ giao dịch cả doanh nghiệp (chủ) */
    public function transactions(Request $request): JsonResponse
    {
        $business = $this->ownedBusiness($request);
        [$from, $to] = TransactionController::dateRange($request);
        $filters = $request->validate([
            'kind' => ['nullable', Rule::in(['buy', 'sell'])],
            'q' => ['nullable', 'string', 'max:100'],
            'member' => ['nullable', 'integer'],
        ]);
        $rows = TransactionFeed::forBusiness($business, $from, $to, $filters);

        return response()->json([
            'data' => $rows->map(fn (array $r): array => collect($r)->except('sort')->all())->values(),
            'meta' => ['from' => $from->toDateString(), 'to' => $to->toDateString(), 'totals' => TransactionFeed::totals($rows)],
        ]);
    }

    /** Đơn chung của các lái (chủ xem số liệu, tải quyết toán) */
    public function deals(Request $request): JsonResponse
    {
        $business = $this->ownedBusiness($request);
        $deals = Deal::query()
            ->where('business_id', $business->id)
            ->with(['entries', 'seller', 'buyer', 'businessUser'])
            ->latest('updated_at')
            ->limit(200)
            ->get();

        return response()->json(['data' => $deals->map(function (Deal $d): array {
            $isBuyer = $d->buyer_id === $d->business_user_id;
            $shared = $d->entries->filter(fn ($e) => $e->kind->isShared() && $e->status->value !== 'disputed');

            return [
                'uuid' => $d->uuid,
                'code' => $d->code,
                'title' => $d->title,
                'status' => $d->status->value,
                'kind' => $isBuyer ? 'buy' : 'sell',
                'member' => ['id' => $d->business_user_id, 'name' => $d->businessUser?->name],
                'counterpart' => TransactionFeed::counterpart($d, $isBuyer),
                'totals' => DealSummary::totals($shared),
                'updated_at' => $d->updated_at?->toIso8601String(),
            ];
        })->values()]);
    }

    /** Tiền ứng: chủ xem tất cả (lọc theo lái), lái xem của mình */
    public function advances(Request $request): JsonResponse
    {
        $membership = $request->user()->membership()->with('business')->firstOrFail();
        $isOwner = $membership->role === BusinessMember::OWNER;
        $member = $isOwner ? $request->validate(['member' => ['nullable', 'integer']])['member'] ?? null : $request->user()->id;

        $advances = BusinessAdvance::query()
            ->where('business_id', $membership->business_id)
            ->when($member, fn ($q, $id) => $q->where('member_id', $id))
            ->with('member')
            ->latest('date')->latest('id')
            ->limit(300)
            ->get();

        return response()->json([
            'data' => $advances->map(fn (BusinessAdvance $a): array => self::presentAdvance($a))->values(),
            // Lái: tiền mình đang giữ
            'cash' => $isOwner ? null : BusinessStats::cash($membership->business, $request->user()->id),
        ]);
    }

    public function storeAdvance(Request $request): JsonResponse
    {
        $business = $this->ownedBusiness($request);
        $data = $request->validate([
            'member' => ['required', 'integer'],
            'kind' => ['required', Rule::in([BusinessAdvance::ADVANCE, BusinessAdvance::RETURN])],
            'amount' => ['required', 'integer', 'min:1', 'max:100000000000'],
            'date' => ['required', 'date_format:Y-m-d', 'before_or_equal:today'],
            'note' => ['nullable', 'string', 'max:255'],
        ]);
        $this->memberOf($business, User::query()->findOrFail($data['member']));

        $advance = $business->advances()->create([
            'member_id' => $data['member'], 'kind' => $data['kind'], 'amount' => $data['amount'],
            'date' => $data['date'], 'note' => $data['note'] ?? null, 'created_by' => $request->user()->id,
        ]);

        return response()->json(['data' => self::presentAdvance($advance->load('member')), 'cash' => BusinessStats::cash($business, (int) $data['member'])], 201);
    }

    public function destroyAdvance(Request $request, BusinessAdvance $advance): Response
    {
        abort_unless($advance->business_id === $this->ownedBusiness($request)->id, 404);
        $advance->delete();

        return response()->noContent();
    }

    /**
     * @return array<string, mixed>
     */
    private static function presentAdvance(BusinessAdvance $a): array
    {
        return [
            'id' => $a->uuid,
            'member' => ['id' => $a->member_id, 'name' => $a->member?->name],
            'kind' => $a->kind,
            'amount' => $a->amount,
            'date' => $a->date->toDateString(),
            'note' => $a->note,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function present(BusinessMember $membership): array
    {
        $business = $membership->business;
        $isOwner = $membership->role === BusinessMember::OWNER;

        return [
            'id' => $business->uuid,
            'name' => $business->name,
            'phone' => $business->phone,
            'address' => $business->address,
            'owner' => ['id' => $business->owner_id, 'name' => $business->owner->name],
            'my_role' => $membership->role,
            'my_status' => $membership->status,
            'my_group' => $membership->group_name,
            // Chỉ chủ thấy mã mời và danh sách lái
            'invite_code' => $isOwner ? $business->invite_code : null,
            'members' => $isOwner ? $business->members()->with('user')->get()->map(fn (BusinessMember $m): array => BusinessStats::member($m))->values()->all() : null,
            // Lái: tiền mình đang giữ
            'my_cash' => $isOwner ? null : BusinessStats::cash($business, $membership->user_id),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function validatedInfo(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'phone' => ['nullable', 'string', 'max:20'],
            'address' => ['nullable', 'string', 'max:255'],
        ]);
    }

    private function ownedBusiness(Request $request): Business
    {
        $membership = $request->user()->membership()->with('business')->first();
        abort_unless($membership?->role === BusinessMember::OWNER, 403, 'Chỉ chủ doanh nghiệp làm được việc này.');

        return $membership->business;
    }

    private function memberOf(Business $business, User $user): BusinessMember
    {
        return $business->members()->where('user_id', $user->id)->firstOrFail();
    }
}
