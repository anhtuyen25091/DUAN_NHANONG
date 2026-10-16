<?php

namespace App\Documents;

use App\Deals\DealSummary;
use App\Enums\DealEntryKind;
use App\Enums\DealEntryStatus;
use App\Enums\PurchaseKind;
use App\Models\Customer;
use App\Models\Deal;
use App\Models\DealEntry;
use App\Models\Purchase;
use App\Models\User;
use App\Support\Provinces;
use App\Support\VietnameseNumber;
use App\Transactions\TransactionFeed;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

/**
 * Lập nội dung giấy tờ gửi khách / lưu sổ:
 * - phiếu mua / bán (1 phiếu), phiếu cân (1 đợt cân của đơn mua bán)
 * - bảng kê 1 khách trong khoảng ngày, quyết toán 1 đơn mua bán
 * - báo cáo tổng hợp theo mặt hàng, theo khách
 */
final class TransactionDocuments
{
    public function purchaseReceipt(Purchase $purchase): Document
    {
        $user = $purchase->user;
        $isBuy = $purchase->kind === PurchaseKind::Buy;
        $rows = [];
        foreach ($purchase->lines as $i => $line) {
            $rows[] = [(string) ($i + 1), $line['name'], self::kg($line['kg']), self::kg($line['deduct_kg']), self::kg($line['net_kg']), self::money($line['price']), self::money($line['amount'])];
        }

        $summary = [['Tổng tiền hàng', self::vnd($purchase->amount), true], ['Đã trả', self::vnd($purchase->paid)]];
        if ($purchase->owing() > 0) {
            $summary[] = [$isBuy ? 'Còn nợ khách' : 'Khách còn nợ', self::vnd($purchase->owing()), true];
        }

        $tables = [new DocumentTable(
            columns: [['STT', 'center'], ['Hàng'], ['Cân (kg)', 'right'], ['Trừ bì (kg)', 'right'], ['Tịnh (kg)', 'right'], ['Đơn giá (đ/kg)', 'right'], ['Thành tiền (đ)', 'right']],
            rows: $rows,
            footer: ['', 'Cộng', self::kg(array_sum(array_column($purchase->lines, 'kg'))), self::kg(array_sum(array_column($purchase->lines, 'deduct_kg'))), self::kg($purchase->kg), '', self::money($purchase->amount)],
        )];
        // Đã sửa sau khi gửi khách: in kèm từng lần sửa (bản cũ → bản mới) để 2 bên đối chiếu
        if ($purchase->shared_version !== null && $purchase->version > $purchase->shared_version) {
            $tables[] = new DocumentTable(
                heading: 'Lịch sử sửa phiếu sau khi gửi khách',
                columns: [['Lần', 'center'], ['Thời gian', 'center'], ['Thay đổi']],
                rows: array_map(fn (array $h): array => [
                    $h['version'] === $purchase->shared_version ? 'Bản gửi khách' : 'Sửa lần '.($h['version'] - $purchase->shared_version),
                    $h['at'] ? CarbonImmutable::parse($h['at'])->setTimezone(config('app.timezone'))->format('d/m/Y H:i') : '',
                    $h['changes'] ? implode('; ', $h['changes']) : 'Tổng tiền '.self::vnd($h['amount']).', đã trả '.self::vnd($h['paid']),
                ], $purchase->history($purchase->shared_version)),
            );
        }

        return new Document(
            title: $purchase->kind->title(),
            subtitle: 'Số: '.$purchase->code().' · Ngày '.self::date($purchase->date),
            issuer: $this->issuer($user),
            info: array_values(array_filter([
                [$isBuy ? 'Người bán' : 'Người mua', $purchase->customer_name],
                $purchase->customer_phone ? ['Số điện thoại', $purchase->customer_phone] : null,
                $purchase->customer?->address ? ['Địa chỉ', $purchase->customer->address] : null,
            ])),
            tables: $tables,
            summary: $summary,
            inWords: VietnameseNumber::money($purchase->amount),
            notes: array_values(array_filter([
                $purchase->note ? 'Ghi chú: '.$purchase->note : null,
                $purchase->version > 1 ? 'Phiếu đã sửa, đây là bản thứ '.$purchase->version.' (lưu lúc '.$purchase->updated_at?->format('d/m/Y H:i').').' : null,
                $purchase->trashed() ? 'Người lập phiếu đã xóa phiếu này ngày '.$purchase->deleted_at->format('d/m/Y H:i').'.' : null,
            ])),
            signatures: $isBuy ? ['Người bán', 'Người mua'] : ['Người mua', 'Người bán'],
            filename: Str::slug(($isBuy ? 'phieu mua ' : 'phieu ban ').$purchase->code()),
        );
    }

    public function dealCutReceipt(DealEntry $entry, User $viewer): Document
    {
        $deal = $entry->deal;
        $goods = $deal->product?->name ?? $deal->title;
        $rows = [];
        foreach ($entry->lines ?? [] as $i => $line) {
            $amount = (int) round((float) ($line['kg'] ?? 0) * (int) ($line['price'] ?? 0));
            $rows[] = [(string) ($i + 1), trim($goods.(empty($line['grade']) ? '' : ' – '.$line['grade'])), self::kg((float) ($line['kg'] ?? 0)), self::money((int) ($line['price'] ?? 0)), self::money($amount)];
        }
        $remaining = $entry->amount - $entry->deposit_deduct - $entry->paid;

        $summary = [['Tiền hàng đợt này', self::vnd($entry->amount), true]];
        if ($entry->deposit_deduct > 0) {
            $summary[] = ['Trừ tiền cọc', self::vnd($entry->deposit_deduct)];
        }
        $summary[] = ['Trả ngay lúc cân', self::vnd($entry->paid)];
        $summary[] = [$remaining >= 0 ? 'Còn lại phải trả' : 'Trả dư', self::vnd(abs($remaining)), true];

        return new Document(
            title: 'PHIẾU CÂN HÀNG',
            subtitle: 'Đơn '.$deal->code.' – '.$deal->title.' · Ngày cân '.self::date($entry->date),
            issuer: $this->issuer($viewer),
            info: $this->dealParties($deal),
            tables: [new DocumentTable(
                columns: [['STT', 'center'], ['Hàng / loại'], ['Khối lượng (kg)', 'right'], ['Đơn giá (đ/kg)', 'right'], ['Thành tiền (đ)', 'right']],
                rows: $rows,
                footer: ['', 'Cộng', self::kg($entry->kg), '', self::money($entry->amount)],
            )],
            summary: $summary,
            inWords: VietnameseNumber::money($entry->amount),
            notes: array_values(array_filter([
                $entry->note ? 'Ghi chú: '.$entry->note : null,
                $entry->status === DealEntryStatus::Pending ? 'Đợt cân này chưa được bên kia xác nhận trên ứng dụng.' : null,
            ])),
            signatures: ['Bên bán', 'Bên mua'],
            filename: Str::slug('phieu can '.$deal->code.' '.$entry->date->format('d-m-Y')),
        );
    }

    /**
     * Quyết toán 1 đơn mua bán: mọi mục chung 2 bên theo ngày, cộng tiền hàng, cọc, đã trả, còn lại.
     */
    public function dealStatement(Deal $deal, User $viewer): Document
    {
        $entries = $deal->entries
            ->filter(fn (DealEntry $e): bool => $e->kind->isShared() && $e->status !== DealEntryStatus::Disputed)
            ->sortBy(fn (DealEntry $e): string => $e->date->toDateString().'|'.$e->id)
            ->values();

        $rows = $entries->map(function (DealEntry $e) use ($deal): array {
            $label = match ($e->kind) {
                DealEntryKind::Cut => 'Đợt cân'.self::grades($e, $deal),
                DealEntryKind::Deposit => 'Đặt cọc',
                DealEntryKind::Payment => 'Trả tiền',
                DealEntryKind::Cost => 'Chi phí',
            };
            $paid = match ($e->kind) {
                DealEntryKind::Cut => $e->paid,
                DealEntryKind::Payment => $e->amount,
                default => 0,
            };

            return [
                self::date($e->date),
                $label.($e->status === DealEntryStatus::Pending ? ' (chờ xác nhận)' : ''),
                $e->kind === DealEntryKind::Cut ? self::kg($e->kg) : '',
                $e->kind === DealEntryKind::Cut ? self::money($e->amount) : '',
                match ($e->kind) {
                    DealEntryKind::Deposit => '+'.self::money($e->amount),
                    DealEntryKind::Cut => $e->deposit_deduct > 0 ? '−'.self::money($e->deposit_deduct) : '',
                    default => '',
                },
                $paid > 0 ? self::money($paid) : '',
            ];
        })->all();

        $t = DealSummary::totals($entries);
        $summary = [
            ['Tổng tiền hàng ('.self::kg($t['kg']).' kg)', self::vnd($t['delivered']), true],
            ['Tiền cọc đã đặt', self::vnd($t['deposit'])],
            ['Cọc đã trừ vào các đợt', self::vnd($t['deducted'])],
            ['Đã trả', self::vnd($t['paid'])],
        ];
        if ($t['deposit_left'] > 0) {
            $summary[] = ['Cọc còn lại (chưa trừ)', self::vnd($t['deposit_left'])];
        }
        $summary[] = [$t['balance'] >= 0 ? 'Bên mua còn phải trả' : 'Bên bán nhận dư', self::vnd(abs($t['balance'])), true];

        $hasPending = $entries->contains(fn (DealEntry $e): bool => $e->status === DealEntryStatus::Pending);

        return new Document(
            title: 'BẢNG QUYẾT TOÁN ĐƠN HÀNG',
            subtitle: 'Đơn '.$deal->code.' – '.$deal->title.' · Lập ngày '.self::date(now()),
            issuer: $this->issuer($viewer),
            info: $this->dealParties($deal),
            tables: [new DocumentTable(
                columns: [['Ngày', 'center'], ['Nội dung'], ['Kg', 'right'], ['Tiền hàng (đ)', 'right'], ['Cọc (đ)', 'right'], ['Đã trả (đ)', 'right']],
                rows: $rows,
                footer: ['', 'Cộng', self::kg($t['kg']), self::money($t['delivered']), self::money($t['deposit'] - $t['deducted']), self::money($t['paid'])],
            )],
            summary: $summary,
            notes: $hasPending ? ['Có mục chưa được bên kia xác nhận trên ứng dụng (ghi "chờ xác nhận"), vẫn được cộng vào bảng này.'] : [],
            signatures: ['Bên bán', 'Bên mua'],
            filename: Str::slug('quyet toan don '.$deal->code),
        );
    }

    /**
     * Bảng kê 1 khách trong khoảng ngày: từng phiếu, cộng tiền hàng, đã trả, còn nợ.
     */
    public function customerStatement(User $user, Customer $customer, CarbonImmutable $from, CarbonImmutable $to): Document
    {
        $rows = TransactionFeed::for($user, $from, $to, ['customer' => $customer->uuid])->sortBy([['date', 'asc'], ['sort', 'asc']])->values();
        $buy = $rows->where('kind', 'buy');
        $sell = $rows->where('kind', 'sell');

        $table = new DocumentTable(
            columns: [['Ngày', 'center'], ['Số phiếu'], ['Hàng'], ['Kg tịnh', 'right'], ['Tiền hàng (đ)', 'right'], ['Đã trả (đ)', 'right'], ['Còn nợ (đ)', 'right']],
            rows: $rows->map(fn (array $r): array => [
                self::date($r['date']),
                $r['code'],
                self::itemsText($r['items']),
                self::kg($r['kg']),
                self::money($r['amount']),
                self::money($r['paid']),
                $r['owing'] > 0 ? self::money($r['owing']) : '',
            ])->all(),
            footer: ['', 'Cộng', '', self::kg((float) $rows->sum('kg')), self::money((int) $rows->sum('amount')), self::money((int) $rows->sum('paid')), self::money((int) $rows->sum('owing'))],
        );

        $summary = [];
        if ($buy->isNotEmpty()) {
            $summary[] = ['Tiền hàng mua của khách', self::vnd((int) $buy->sum('amount'))];
            $summary[] = ['Còn nợ khách (chưa trả)', self::vnd((int) $buy->sum('owing')), true];
        }
        if ($sell->isNotEmpty()) {
            $summary[] = ['Tiền hàng bán cho khách', self::vnd((int) $sell->sum('amount'))];
            $summary[] = ['Khách còn nợ', self::vnd((int) $sell->sum('owing')), true];
        }

        return new Document(
            title: 'BẢNG KÊ GIAO DỊCH',
            subtitle: 'Từ ngày '.self::date($from).' đến ngày '.self::date($to),
            issuer: $this->issuer($user),
            info: array_values(array_filter([
                ['Khách hàng', $customer->name],
                $customer->phone ? ['Số điện thoại', $customer->phone] : null,
                $customer->address ? ['Địa chỉ', $customer->address] : null,
                ['Số phiếu', (string) $rows->count()],
            ])),
            tables: [$table],
            summary: $summary,
            signatures: ['Khách hàng', 'Người lập bảng'],
            filename: Str::slug('bang ke '.$customer->name.' '.$from->format('d-m-Y').' '.$to->format('d-m-Y')),
        );
    }

    /**
     * Báo cáo tổng hợp: mua vào / bán ra theo mặt hàng, theo khách, và danh sách chi tiết.
     */
    public function report(User $user, CarbonImmutable $from, CarbonImmutable $to): Document
    {
        $rows = TransactionFeed::for($user, $from, $to)->sortBy([['date', 'asc'], ['sort', 'asc']])->values();
        $totals = TransactionFeed::totals($rows);
        $tables = [];

        foreach (['buy' => 'Mua vào theo mặt hàng', 'sell' => 'Bán ra theo mặt hàng'] as $kind => $heading) {
            $items = $rows->where('kind', $kind)->flatMap(fn (array $r): array => $r['items']);
            if ($items->isEmpty()) {
                continue;
            }
            $byName = $items->groupBy('name')->map(fn (Collection $g, string $name): array => [
                'name' => $name, 'kg' => (float) $g->sum('kg'), 'amount' => (int) $g->sum('amount'),
            ])->sortByDesc('amount')->values();
            $tables[] = new DocumentTable(
                heading: $heading,
                columns: [['Hàng'], ['Kg', 'right'], ['Giá bình quân (đ/kg)', 'right'], ['Tiền hàng (đ)', 'right']],
                rows: $byName->map(fn (array $p): array => [$p['name'], self::kg($p['kg']), $p['kg'] > 0 ? self::money((int) round($p['amount'] / $p['kg'])) : '', self::money($p['amount'])])->all(),
                footer: ['Cộng', self::kg($totals[$kind]['kg']), '', self::money($totals[$kind]['amount'])],
            );
        }

        $byCustomer = $rows->groupBy('counterpart')->map(fn (Collection $g, string $name): array => [
            $name,
            (string) $g->count(),
            self::kg((float) $g->sum('kg')),
            self::money((int) $g->where('kind', 'buy')->sum('amount')),
            self::money((int) $g->where('kind', 'sell')->sum('amount')),
            self::money((int) $g->sum('owing')),
        ])->sortBy(0)->values()->all();
        $tables[] = new DocumentTable(
            heading: 'Theo khách',
            columns: [['Khách'], ['Số lần', 'right'], ['Kg', 'right'], ['Mua của khách (đ)', 'right'], ['Bán cho khách (đ)', 'right'], ['Còn nợ (đ)', 'right']],
            rows: $byCustomer,
        );

        $tables[] = new DocumentTable(
            heading: 'Chi tiết giao dịch',
            columns: [['Ngày', 'center'], ['Số'], ['Khách'], ['Loại'], ['Hàng'], ['Kg', 'right'], ['Tiền hàng (đ)', 'right'], ['Còn nợ (đ)', 'right']],
            rows: $rows->map(fn (array $r): array => [
                self::date($r['date']),
                $r['code'],
                $r['counterpart'],
                ($r['kind'] === 'buy' ? 'Mua' : 'Bán').($r['pending'] ? ' (chờ)' : ''),
                self::itemsText($r['items']),
                self::kg($r['kg']),
                self::money($r['amount']),
                $r['owing'] > 0 ? self::money($r['owing']) : '',
            ])->all(),
        );

        return new Document(
            title: 'BÁO CÁO GIAO DỊCH',
            subtitle: 'Từ ngày '.self::date($from).' đến ngày '.self::date($to),
            issuer: $this->issuer($user),
            info: [
                ['Số giao dịch', (string) $totals['count']],
                ['Mua vào', self::kg($totals['buy']['kg']).' kg · '.self::vnd($totals['buy']['amount']).' · còn nợ khách '.self::vnd($totals['buy']['owing'])],
                ['Bán ra', self::kg($totals['sell']['kg']).' kg · '.self::vnd($totals['sell']['amount']).' · khách còn nợ '.self::vnd($totals['sell']['owing'])],
            ],
            tables: $tables,
            notes: $rows->contains('pending', true) ? ['"(chờ)": đợt cân của đơn mua bán chưa được bên kia xác nhận, vẫn được cộng.'] : [],
            filename: Str::slug('bao cao giao dich '.$from->format('d-m-Y').' '.$to->format('d-m-Y')),
            landscape: true,
        );
    }

    /**
     * Bên lập phiếu: hồ sơ điểm mua (nếu có), không thì tên + SĐT tài khoản.
     *
     * @return array{name: string, lines: list<string>}
     */
    private function issuer(User $user): array
    {
        $buyer = $user->buyer;
        $lines = array_values(array_filter([
            ($buyer?->phone ?? $user->phone) ? 'SĐT: '.($buyer?->phone ?? $user->phone) : null,
            $buyer?->address ? 'Địa chỉ: '.$buyer->address.($buyer->province_code ? ', '.Provinces::name($buyer->province_code) : '') : null,
        ]));

        return ['name' => $buyer?->name ?? $user->name, 'lines' => $lines];
    }

    /**
     * @return list<array{0: string, 1: string}>
     */
    private function dealParties(Deal $deal): array
    {
        $seller = $deal->seller?->name ?? $deal->seller_name ?? '—';
        $buyer = $deal->buyer?->name ?? $deal->buyer_name ?? '—';

        return array_values(array_filter([
            ['Bên bán', $seller.($deal->seller?->phone ? ' · '.$deal->seller->phone : '')],
            ['Bên mua', $buyer.($deal->buyer?->phone ? ' · '.$deal->buyer->phone : '')],
            $deal->product ? ['Mặt hàng', $deal->product->name] : null,
        ]));
    }

    private static function grades(DealEntry $e, Deal $deal): string
    {
        $grades = array_filter(array_map(fn (array $l): string => trim((string) ($l['grade'] ?? '')), $e->lines ?? []));

        return $grades ? ': '.implode(', ', $grades) : '';
    }

    /**
     * @param  list<array{name: string, kg: float|int}>  $items
     */
    private static function itemsText(array $items): string
    {
        return implode('; ', array_map(fn (array $i): string => $i['name'].': '.self::kg((float) $i['kg']).' kg', $items));
    }

    public static function money(int $amount): string
    {
        return number_format($amount, 0, ',', '.');
    }

    public static function vnd(int $amount): string
    {
        return self::money($amount).' đ';
    }

    /** 1234.5 → "1.234,5"; 1000 → "1.000" */
    public static function kg(float $kg): string
    {
        return rtrim(rtrim(number_format($kg, 3, ',', '.'), '0'), ',');
    }

    public static function date(CarbonInterface|string $date): string
    {
        return ($date instanceof CarbonInterface ? $date : CarbonImmutable::parse($date))->format('d/m/Y');
    }
}
