<?php

namespace App\Support;

use App\Models\LedgerRecord;
use App\Models\User;
use Illuminate\Support\Collection;

/**
 * Đọc sổ thu chi đồng bộ của 1 người dùng (bảng ledger_records, dữ liệu JSON y như trên máy) để admin xem:
 * nối tên vườn / hạng mục, cộng thu chi theo vườn, công nợ còn lại, hợp đồng bán cho lái. Bỏ bản ghi đã xóa.
 */
final class LedgerReader
{
    /** @var array<string, Collection<string, array<string, mixed>>> */
    private array $tables;

    public function __construct(public readonly User $user)
    {
        $this->tables = LedgerRecord::query()
            ->where('user_id', $user->id)
            ->where('is_deleted', false)
            ->get(['tbl', 'uuid', 'data'])
            ->groupBy('tbl')
            ->map(fn (Collection $rows): Collection => $rows->mapWithKeys(fn (LedgerRecord $r): array => [$r->uuid => $r->data])
                // Bản ghi xóa mềm trên máy (deleted_at) cũng bỏ
                ->reject(fn (array $data): bool => ! empty($data['deleted_at'])))
            ->all();
    }

    /**
     * @return Collection<string, array<string, mixed>>
     */
    public function table(string $name): Collection
    {
        return $this->tables[$name] ?? collect();
    }

    /**
     * Khoản thu / chi mới trước, kèm tên vườn và hạng mục
     *
     * @return list<array{date: string, type: string, type_label: string, garden: string, category: string, amount: int, note: string|null}>
     */
    public function transactions(): array
    {
        $gardens = $this->table('gardens');
        $categories = $this->table('categories');

        return $this->table('transactions')
            ->map(fn (array $t): array => [
                'date' => (string) ($t['date'] ?? ''),
                'type' => (string) ($t['type'] ?? ''),
                'type_label' => ($t['type'] ?? '') === 'income' ? 'Thu' : 'Chi',
                'garden' => isset($t['garden_id']) ? (string) ($gardens->get($t['garden_id'])['name'] ?? '(vườn đã xóa)') : 'Chi chung',
                'category' => (string) ($categories->get($t['category_id'] ?? '')['name'] ?? ''),
                'amount' => (int) ($t['amount'] ?? 0),
                'note' => $t['note'] ?? null,
            ])
            ->sortByDesc('date')
            ->values()
            ->all();
    }

    /**
     * Tổng thu / chi / lời, cả sổ và theo từng vườn (chi chung tính riêng 1 dòng)
     *
     * @return array{income: int, expense: int, profit: int, gardens: list<array{name: string, income: int, expense: int, profit: int}>}
     */
    public function totals(): array
    {
        $rows = collect($this->transactions());
        $sum = fn (Collection $c, string $type): int => (int) $c->where('type', $type)->sum('amount');
        $gardens = $rows->groupBy('garden')->map(fn (Collection $g, string $name): array => [
            'name' => $name,
            'income' => $sum($g, 'income'),
            'expense' => $sum($g, 'expense'),
            'profit' => $sum($g, 'income') - $sum($g, 'expense'),
        ])->sortBy('name')->values()->all();

        return ['income' => $sum($rows, 'income'), 'expense' => $sum($rows, 'expense'), 'profit' => $sum($rows, 'income') - $sum($rows, 'expense'), 'gardens' => $gardens];
    }

    /**
     * Công nợ / tiền vay: còn lại = số nợ − tổng gốc đã trả
     *
     * @return list<array{kind: string, party: string, date: string, due_on: string|null, amount: int, paid: int, left: int}>
     */
    public function debts(): array
    {
        $paid = $this->table('debt_payments')->groupBy(fn (array $p): string => (string) ($p['debt_id'] ?? ''))->map(fn (Collection $g): int => (int) $g->sum('amount'));
        $labels = ['payable' => 'Mình nợ', 'receivable' => 'Người ta nợ mình', 'loan' => 'Tiền vay'];

        return $this->table('debts')
            ->map(fn (array $d, string $id): array => [
                'kind' => $labels[$d['kind'] ?? ''] ?? (string) ($d['kind'] ?? ''),
                'party' => (string) ($d['party'] ?? ''),
                'date' => (string) ($d['date'] ?? ''),
                'due_on' => $d['due_on'] ?? null,
                'amount' => (int) ($d['amount'] ?? 0),
                'paid' => (int) ($paid[$id] ?? 0),
                'left' => (int) ($d['amount'] ?? 0) - (int) ($paid[$id] ?? 0),
            ])
            ->sortByDesc('date')
            ->values()
            ->all();
    }

    /**
     * Hợp đồng bán cho lái (cọc + nhiều đợt cắt)
     *
     * @return list<array{buyer: string, garden: string, date: string, deposit: int, cuts: int, value: int, status: string}>
     */
    public function contracts(): array
    {
        $gardens = $this->table('gardens');
        $cuts = $this->table('harvest_cuts')->groupBy(fn (array $c): string => (string) ($c['contract_id'] ?? ''));
        $status = ['open' => 'Đang làm', 'done' => 'Đã xong', 'forfeited' => 'Lái bỏ cọc', 'refunded' => 'Trả lại cọc'];

        return $this->table('harvest_contracts')
            ->map(function (array $c, string $id) use ($gardens, $cuts, $status): array {
                $mine = $cuts->get($id, collect());
                $value = (int) $mine->sum(fn (array $cut): float => array_sum(array_map(fn (array $l): float => (float) ($l['kg'] ?? 0) * (float) ($l['price'] ?? 0), $cut['lines'] ?? [])));

                return [
                    'buyer' => (string) ($c['buyer'] ?? ''),
                    'garden' => (string) ($gardens->get($c['garden_id'] ?? '')['name'] ?? ''),
                    'date' => (string) ($c['date'] ?? ''),
                    'deposit' => (int) ($c['deposit'] ?? 0),
                    'cuts' => $mine->count(),
                    'value' => $value,
                    'status' => $status[$c['status'] ?? ''] ?? (string) ($c['status'] ?? ''),
                ];
            })
            ->sortByDesc('date')
            ->values()
            ->all();
    }
}
