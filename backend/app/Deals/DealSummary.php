<?php

namespace App\Deals;

use App\Enums\DealEntryKind;
use App\Enums\DealEntryStatus;
use App\Models\Deal;
use App\Models\DealEntry;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * Số liệu của đơn mua bán, chỉ tính các mục đã xác nhận (mục chờ xác nhận tính riêng để hiện "nếu đồng ý").
 *
 * - delivered: tiền hàng các đợt cân; kg: tổng kg
 * - deposit: tiền cọc; deducted: cọc đã trừ vào các đợt; deposit_left = deposit − deducted
 * - paid: tiền trả ngay lúc cân + các lần trả sau
 * - balance = delivered − deducted − paid: > 0 bên mua còn nợ bên bán; < 0 bên bán nhận dư
 */
final class DealSummary
{
    /**
     * @param  Collection<int, DealEntry>  $entries
     * @return array{delivered: int, kg: float, deposit: int, deducted: int, deposit_left: int, paid: int, balance: int}
     */
    public static function totals(Collection $entries): array
    {
        $cuts = $entries->where('kind', DealEntryKind::Cut);
        $delivered = (int) $cuts->sum('amount');
        $deposit = (int) $entries->where('kind', DealEntryKind::Deposit)->sum('amount');
        $deducted = (int) $cuts->sum('deposit_deduct');
        $paid = (int) $cuts->sum('paid') + (int) $entries->where('kind', DealEntryKind::Payment)->sum('amount');

        return [
            'delivered' => $delivered,
            'kg' => round((float) $cuts->sum('kg'), 3),
            'deposit' => $deposit,
            'deducted' => $deducted,
            'deposit_left' => $deposit - $deducted,
            'paid' => $paid,
            'balance' => $delivered - $deducted - $paid,
        ];
    }

    /**
     * @return array{confirmed: array<string, int|float>, with_pending: array<string, int|float>, awaiting_me: int, awaiting_other: int, disputed: int}
     */
    public static function for(Deal $deal, User $viewer): array
    {
        $shared = $deal->entries->filter(fn (DealEntry $e): bool => $e->kind->isShared());
        $confirmed = $shared->where('status', DealEntryStatus::Confirmed);
        $pending = $shared->where('status', DealEntryStatus::Pending);

        return [
            'confirmed' => self::totals($confirmed),
            'with_pending' => self::totals($confirmed->merge($pending)),
            'awaiting_me' => $pending->where('created_by', '!=', $viewer->id)->count(),
            'awaiting_other' => $pending->where('created_by', $viewer->id)->count(),
            'disputed' => $shared->where('status', DealEntryStatus::Disputed)->count(),
        ];
    }

    /**
     * Lời của 1 lô (thương lái): đơn bán cho chi nhánh trừ các đơn mua từ nông dân đã gộp vào và chi phí riêng.
     *
     * @return array{revenue: int, sell_kg: float, buy_cost: int, buy_kg: float, costs: int, profit: int, kg_loss: float, sources: int}|null
     */
    public static function lot(Deal $deal, User $viewer): ?array
    {
        if ($deal->seller_id !== $viewer->id) {
            return null;
        }

        $confirmedCuts = fn (Deal $d) => $d->entries->where('kind', DealEntryKind::Cut)->where('status', DealEntryStatus::Confirmed);
        $myCosts = fn (Deal $d): int => (int) $d->entries->where('kind', DealEntryKind::Cost)->where('created_by', $viewer->id)->sum('amount');
        $sources = $deal->sources;

        $revenue = (int) $confirmedCuts($deal)->sum('amount');
        $sellKg = (float) $confirmedCuts($deal)->sum('kg');
        $buyCost = (int) $sources->sum(fn (Deal $d): int => (int) $confirmedCuts($d)->sum('amount'));
        $buyKg = (float) $sources->sum(fn (Deal $d): float => (float) $confirmedCuts($d)->sum('kg'));
        $costs = $myCosts($deal) + (int) $sources->sum($myCosts);

        return [
            'revenue' => $revenue,
            'sell_kg' => round($sellKg, 3),
            'buy_cost' => $buyCost,
            'buy_kg' => round($buyKg, 3),
            'costs' => $costs,
            'profit' => $revenue - $buyCost - $costs,
            'kg_loss' => round($buyKg - $sellKg, 3),
            'sources' => $sources->count(),
        ];
    }
}
