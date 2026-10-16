<?php

namespace App\Businesses;

use App\Enums\DealEntryKind;
use App\Enums\DealEntryStatus;
use App\Enums\DealStatus;
use App\Enums\PurchaseKind;
use App\Models\Business;
use App\Models\BusinessAdvance;
use App\Models\BusinessMember;
use App\Models\Deal;
use App\Models\DealEntry;
use App\Models\Purchase;
use App\Transactions\TransactionFeed;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * Số liệu doanh nghiệp cho chủ: mua / bán theo từng lái trong khoảng ngày, và tiền mặt từng lái đang giữ.
 *
 * Tiền lái đang giữ (tính từ trước đến nay) = chủ đã ứng − lái đã nộp lại − tiền lái đã trả ra + tiền lái đã thu vào.
 * - Trả ra: "đã trả" trong phiếu mua; trong đơn chung lái là bên mua thì cọc, trả ngay lúc cân, các lần trả.
 * - Thu vào: "đã trả" trong phiếu bán; trong đơn chung lái là bên bán thì cọc, tiền nhận lúc cân, các lần trả.
 * Đợt cân / cọc bị báo sai, đơn đã hủy thì không tính.
 */
final class BusinessStats
{
    /**
     * @return array{advanced: int, returned: int, paid_out: int, received: int, holding: int}
     */
    public static function cash(Business $business, int $memberId): array
    {
        $advances = BusinessAdvance::query()->where('business_id', $business->id)->where('member_id', $memberId);
        $advanced = (int) (clone $advances)->where('kind', BusinessAdvance::ADVANCE)->sum('amount');
        $returned = (int) (clone $advances)->where('kind', BusinessAdvance::RETURN)->sum('amount');

        $purchases = Purchase::query()->where('business_id', $business->id)->where('user_id', $memberId);
        $paidOut = (int) (clone $purchases)->where('kind', PurchaseKind::Buy)->sum('paid');
        $received = (int) (clone $purchases)->where('kind', PurchaseKind::Sell)->sum('paid');

        $deals = Deal::query()->where('business_id', $business->id)->where('business_user_id', $memberId)->where('status', '!=', DealStatus::Cancelled)->get(['id', 'buyer_id']);
        if ($deals->isNotEmpty()) {
            $entries = DealEntry::query()
                ->whereIn('deal_id', $deals->pluck('id'))
                ->whereIn('kind', [DealEntryKind::Deposit, DealEntryKind::Cut, DealEntryKind::Payment])
                ->whereIn('status', [DealEntryStatus::Confirmed, DealEntryStatus::Pending])
                ->get(['deal_id', 'kind', 'amount', 'paid']);
            $buyerDeals = $deals->where('buyer_id', $memberId)->pluck('id')->flip();
            foreach ($entries as $e) {
                $money = $e->kind === DealEntryKind::Cut ? $e->paid : $e->amount;
                $buyerDeals->has($e->deal_id) ? $paidOut += $money : $received += $money;
            }
        }

        return [
            'advanced' => $advanced,
            'returned' => $returned,
            'paid_out' => $paidOut,
            'received' => $received,
            'holding' => $advanced - $returned - $paidOut + $received,
        ];
    }

    /**
     * Tổng hợp cho chủ: từng thành viên (mua / bán trong khoảng ngày + tiền đang giữ), cả doanh nghiệp, theo mặt hàng.
     *
     * @return array{members: list<array<string, mixed>>, totals: array<string, mixed>, products: list<array<string, mixed>>}
     */
    public static function summary(Business $business, CarbonImmutable $from, CarbonImmutable $to): array
    {
        $rows = TransactionFeed::forBusiness($business, $from, $to);
        $byMember = $rows->groupBy(fn (array $r): int => $r['member']['id']);

        $members = $business->members()->with('user')->orderByRaw("role = 'owner' desc")->orderBy('group_name')->get()
            ->map(fn (BusinessMember $m): array => [
                ...self::member($m),
                'totals' => TransactionFeed::totals($byMember->get($m->user_id, collect())),
                'cash' => self::cash($business, $m->user_id),
            ])
            ->values()
            ->all();

        $products = $rows->flatMap(fn (array $r): array => array_map(fn (array $i): array => [...$i, 'kind' => $r['kind']], $r['items']))
            ->groupBy(fn (array $i): string => $i['kind'].'|'.$i['name'])
            ->map(fn (Collection $g): array => [
                'kind' => $g->first()['kind'],
                'name' => $g->first()['name'],
                'kg' => round((float) $g->sum('kg'), 3),
                'amount' => (int) $g->sum('amount'),
            ])
            ->sortByDesc('amount')
            ->values()
            ->all();

        return [
            'members' => $members,
            'totals' => [
                ...TransactionFeed::totals($rows),
                'holding' => array_sum(array_map(fn (array $m): int => $m['cash']['holding'], $members)),
            ],
            'products' => $products,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public static function member(BusinessMember $m): array
    {
        return [
            'id' => $m->user_id,
            'name' => $m->user->name,
            'phone' => $m->user->phone,
            'role' => $m->role,
            'group_name' => $m->group_name,
            'status' => $m->status,
            'created_by_owner' => $m->created_by_owner,
            'joined_at' => $m->created_at?->toIso8601String(),
        ];
    }
}
