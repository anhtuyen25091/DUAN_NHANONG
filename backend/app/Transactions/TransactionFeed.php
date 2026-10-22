<?php

namespace App\Transactions;

use App\Enums\DealEntryKind;
use App\Enums\DealEntryStatus;
use App\Enums\DealStatus;
use App\Models\Business;
use App\Models\Deal;
use App\Models\DealEntry;
use App\Models\Purchase;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * Sổ giao dịch của điểm thu mua / thương lái: gộp phiếu mua / bán (khách vãng lai) với các đợt cân
 * của đơn mua bán chung 2 bên, thành 1 danh sách cùng dạng để xem, lọc, cộng tổng và in báo cáo.
 *
 * Đợt cân bị báo sai, đơn đã hủy thì bỏ; đợt cân chờ bên kia xác nhận vẫn tính (bên kia có thể chưa dùng app), có cờ pending.
 */
final class TransactionFeed
{
    /**
     * @param  array{kind?: string|null, q?: string|null, customer?: string|null}  $filters
     * @return Collection<int, array<string, mixed>>
     */
    public static function for(User $user, CarbonImmutable $from, CarbonImmutable $to, array $filters = []): Collection
    {
        $rows = self::purchases($user, $from, $to, $filters);
        if (empty($filters['customer'])) {
            $rows = $rows->merge(self::dealCuts($user, $from, $to));
        }

        return self::filter($rows, $filters);
    }

    /**
     * Sổ giao dịch cả doanh nghiệp (chủ xem): phiếu và đợt cân của mọi lái, mỗi dòng kèm lái nào làm.
     * member: chỉ 1 lái (id tài khoản).
     *
     * @param  array{kind?: string|null, q?: string|null, customer?: string|null, member?: int|string|null}  $filters
     * @return Collection<int, array<string, mixed>>
     */
    public static function forBusiness(Business $business, CarbonImmutable $from, CarbonImmutable $to, array $filters = []): Collection
    {
        $member = isset($filters['member']) ? (int) $filters['member'] : null;
        $rows = self::purchaseQuery($from, $to, $filters)
            ->with('user')
            ->where('business_id', $business->id)
            ->when($member, fn (Builder $q, int $id) => $q->where('user_id', $id))
            ->get()
            ->toBase()
            ->map(fn (Purchase $p): array => [...self::fromPurchase($p), 'member' => ['id' => $p->user_id, 'name' => $p->user->name]]);

        if (empty($filters['customer'])) {
            $rows = $rows->merge(self::dealCutQuery($from, $to)
                ->with('deal.businessUser')
                ->whereHas('deal', fn (Builder $q) => $q->where('business_id', $business->id)
                    ->where('status', '!=', DealStatus::Cancelled)
                    ->when($member, fn (Builder $w, int $id) => $w->where('business_user_id', $id)))
                ->get()
                ->toBase()
                ->filter(fn (DealEntry $e): bool => $e->deal->businessUser !== null)
                ->map(fn (DealEntry $e): array => [
                    ...self::fromDealCut($e, $e->deal->businessUser),
                    'member' => ['id' => $e->deal->business_user_id, 'name' => $e->deal->businessUser->name],
                ]));
        }

        return self::filter($rows, $filters);
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $rows
     * @param  array<string, mixed>  $filters
     * @return Collection<int, array<string, mixed>>
     */
    private static function filter(Collection $rows, array $filters): Collection
    {
        $kind = $filters['kind'] ?? null;
        $q = mb_strtolower(trim((string) ($filters['q'] ?? '')));

        return $rows
            ->when($kind, fn (Collection $c) => $c->where('kind', $kind))
            ->when($q !== '', fn (Collection $c) => $c->filter(fn (array $row): bool => str_contains(mb_strtolower($row['counterpart'].' '.$row['code'].' '.implode(' ', array_column($row['items'], 'name'))), $q)))
            ->sortBy([['date', 'desc'], ['sort', 'desc']])
            ->values();
    }

    /**
     * Cộng tổng: mua vào, bán ra, đã trả, còn nợ (mỗi chiều)
     *
     * @param  Collection<int, array<string, mixed>>  $rows
     * @return array{count: int, buy: array{kg: float, amount: int, paid: int, owing: int}, sell: array{kg: float, amount: int, paid: int, owing: int}}
     */
    public static function totals(Collection $rows): array
    {
        $sum = fn (string $kind): array => [
            'kg' => round((float) $rows->where('kind', $kind)->sum('kg'), 3),
            'amount' => (int) $rows->where('kind', $kind)->sum('amount'),
            'paid' => (int) $rows->where('kind', $kind)->sum('paid'),
            'owing' => (int) $rows->where('kind', $kind)->sum('owing'),
        ];

        return ['count' => $rows->count(), 'buy' => $sum('buy'), 'sell' => $sum('sell')];
    }

    /**
     * @param  array{kind?: string|null, q?: string|null, customer?: string|null}  $filters
     * @return Collection<int, array<string, mixed>>
     */
    private static function purchases(User $user, CarbonImmutable $from, CarbonImmutable $to, array $filters): Collection
    {
        return self::purchaseQuery($from, $to, $filters)
            ->where('user_id', $user->id)
            ->get()
            ->toBase()
            ->map(fn (Purchase $p): array => self::fromPurchase($p));
    }

    /**
     * @param  array<string, mixed>  $filters
     * @return Builder<Purchase>
     */
    private static function purchaseQuery(CarbonImmutable $from, CarbonImmutable $to, array $filters): Builder
    {
        return Purchase::query()
            ->with('customer')
            ->where('date', '>=', $from->toDateString())
            // < ngày hôm sau: đúng cả khi cột ngày lưu kèm giờ (SQLite)
            ->where('date', '<', $to->addDay()->toDateString())
            ->when($filters['customer'] ?? null, fn (Builder $q, string $uuid) => $q->whereHas('customer', fn (Builder $c) => $c->where('uuid', $uuid)));
    }

    /**
     * @return array<string, mixed>
     */
    public static function fromPurchase(Purchase $p): array
    {
        return [
            'source' => 'purchase',
            'id' => $p->uuid,
            'code' => $p->code(),
            'date' => $p->date->toDateString(),
            'kind' => $p->kind->value,
            'counterpart' => $p->customer_name,
            'phone' => $p->customer_phone,
            'customer' => $p->customer?->uuid,
            'deal' => null,
            'items' => array_map(fn (array $l): array => ['name' => $l['name'], 'kg' => $l['net_kg'], 'price' => $l['price'], 'amount' => $l['amount']], $p->lines),
            'kg' => $p->kg,
            'amount' => $p->amount,
            'paid' => $p->paid,
            'owing' => $p->owing(),
            'pending' => false,
            'note' => $p->note,
            // Lái mua vượt giá chủ chốt
            'over_limit' => ! empty($p->price_warnings),
            'sort' => $p->created_at?->timestamp ?? 0,
        ];
    }

    /**
     * @return Collection<int, array<string, mixed>>
     */
    private static function dealCuts(User $user, CarbonImmutable $from, CarbonImmutable $to): Collection
    {
        return self::dealCutQuery($from, $to)
            // Đơn đã hủy không còn là giao dịch
            ->whereHas('deal', fn (Builder $q) => $q->forUser($user)->where('status', '!=', DealStatus::Cancelled))
            ->get()
            ->toBase()
            ->map(fn (DealEntry $e): array => self::fromDealCut($e, $user));
    }

    /**
     * @return Builder<DealEntry>
     */
    private static function dealCutQuery(CarbonImmutable $from, CarbonImmutable $to): Builder
    {
        return DealEntry::query()
            ->with(['deal.seller', 'deal.buyer', 'deal.product'])
            ->where('kind', DealEntryKind::Cut)
            ->whereIn('status', [DealEntryStatus::Confirmed, DealEntryStatus::Pending])
            ->where('date', '>=', $from->toDateString())
            // < ngày hôm sau: đúng cả khi cột ngày lưu kèm giờ (SQLite)
            ->where('date', '<', $to->addDay()->toDateString());
    }

    /**
     * @return array<string, mixed>
     */
    public static function fromDealCut(DealEntry $e, User $viewer): array
    {
        $deal = $e->deal;
        $isBuyer = $deal->buyer_id === $viewer->id;
        $goods = $deal->product?->name ?? $deal->title;
        // Trừ cọc cũng là tiền bên mua đã đưa
        $paid = $e->paid + $e->deposit_deduct;

        return [
            'source' => 'deal',
            'id' => $e->uuid,
            'code' => 'Đơn '.$deal->code,
            'date' => $e->date->toDateString(),
            'kind' => $isBuyer ? 'buy' : 'sell',
            'counterpart' => self::counterpart($deal, $isBuyer),
            'phone' => ($isBuyer ? $deal->seller : $deal->buyer)?->phone,
            'customer' => null,
            'deal' => $deal->uuid,
            'items' => array_map(fn (array $l): array => [
                'name' => trim($goods.(empty($l['grade']) ? '' : ' – '.$l['grade'])),
                'kg' => (float) ($l['kg'] ?? 0),
                'price' => (int) ($l['price'] ?? 0),
                'amount' => (int) round((float) ($l['kg'] ?? 0) * (int) ($l['price'] ?? 0)),
            ], $e->lines ?? []),
            'kg' => $e->kg,
            'amount' => $e->amount,
            'paid' => $paid,
            'owing' => max(0, $e->amount - $paid),
            'pending' => $e->status === DealEntryStatus::Pending,
            'note' => $e->note,
            'sort' => $e->created_at?->timestamp ?? 0,
        ];
    }

    /** Tên bên kia của đơn: tài khoản đã tham gia, hoặc tên người tạo gõ cho bên đó */
    public static function counterpart(Deal $deal, bool $viewerIsBuyer): string
    {
        return $viewerIsBuyer
            ? ($deal->seller?->name ?? $deal->seller_name ?? 'Bên bán')
            : ($deal->buyer?->name ?? $deal->buyer_name ?? 'Bên mua');
    }
}
