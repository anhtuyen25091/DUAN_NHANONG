/**
 * Sổ thu chi Nâng cao: các hàm tính thuần (không ghi dữ liệu) cho mùa vụ, kho vật tư, công nợ.
 * Dùng chung cho web, mobile và test.
 */
import type { LedgerSnapshot } from './ledger';
import type { Debt, DebtKind, Season, Supply, Transaction } from './types';

// ---- Kho vật tư ----

/** Thành tiền của lô vật tư (làm tròn đồng) */
export function supplyCost(supply: Pick<Supply, 'quantity' | 'unit_price'>): number {
  return Math.round(supply.quantity * supply.unit_price);
}

/** 2.5 -> "2,5"; 10 -> "10" (tự định dạng: Hermes trên Android không chắc có dữ liệu locale vi-VN) */
export function formatQty(quantity: number): string {
  return String(Math.round(quantity * 1000) / 1000).replace('.', ',');
}

/** Ghi chú của khoản tiền ra khi mua vật tư: "4 bao NPK 16-16-8 · Đại lý Hai Lúa" */
export function supplyEntryNote(supply: Pick<Supply, 'quantity' | 'unit' | 'name' | 'shop_name'>): string {
  return `${formatQty(supply.quantity)} ${supply.unit} ${supply.name}${supply.shop_name ? ` · ${supply.shop_name}` : ''}`;
}

export interface SupplyStock {
  supply: Supply;
  used: number;
  left: number;
  /** Giá trị phần còn trong kho */
  leftValue: number;
}

/** Tồn kho từng vật tư; còn hàng trước, hết hàng sau */
export function supplyStock(data: Pick<LedgerSnapshot, 'supplies' | 'supply_usages'>): SupplyStock[] {
  const used = new Map<string, number>();
  for (const u of data.supply_usages) used.set(u.supply_id, (used.get(u.supply_id) ?? 0) + u.quantity);
  return data.supplies
    .map((supply) => {
      const u = used.get(supply.id) ?? 0;
      const left = Math.max(0, supply.quantity - u);
      return { supply, used: u, left, leftValue: Math.round(left * supply.unit_price) };
    })
    .sort((a, b) => Number(b.left > 1e-9) - Number(a.left > 1e-9));
}

/** Khoản ảo sinh ra khi dùng vật tư; id bắt đầu bằng "usage:" để giao diện không cho sửa/xóa như khoản thường */
export const USAGE_ENTRY_PREFIX = 'usage:';

/**
 * Các khoản dùng để tính lời/lỗ theo vườn khi có kho vật tư.
 * Mua vật tư ghi tiền ra ở "chi chung"; mỗi lần dùng cho vườn A thì thêm 1 khoản tiền ra cho A
 * và 1 khoản âm cùng số tiền cho nơi đã mua (thường là chi chung). Tổng lời/lỗ của cả sổ không đổi.
 */
export function allocatedEntries(data: Pick<LedgerSnapshot, 'transactions' | 'supplies' | 'supply_usages'>): Transaction[] {
  const supplies = new Map(data.supplies.map((s) => [s.id, s]));
  const purchases = new Map<string, Transaction>();
  for (const t of data.transactions) if (t.supply_id) purchases.set(t.supply_id, t);

  const extra: Transaction[] = [];
  for (const usage of data.supply_usages) {
    const supply = supplies.get(usage.supply_id);
    const purchase = supply && purchases.get(supply.id);
    if (!supply || !purchase || purchase.garden_id === usage.garden_id) continue;
    const amount = Math.round(usage.quantity * supply.unit_price);
    const base = { type: 'expense' as const, season_id: null, category_id: supply.category_id, supply_id: supply.id, updated_at: usage.updated_at, deleted_at: null };
    const note = `Dùng ${formatQty(usage.quantity)} ${supply.unit} ${supply.name}`;
    extra.push(
      { ...base, id: `${USAGE_ENTRY_PREFIX}${usage.id}`, amount, date: usage.used_on, garden_id: usage.garden_id, note },
      { ...base, id: `${USAGE_ENTRY_PREFIX}${usage.id}:back`, amount: -amount, date: usage.used_on, garden_id: purchase.garden_id, note },
    );
  }
  return extra.length ? [...data.transactions, ...extra] : data.transactions;
}

/** Tiền vật tư đã dùng cho 1 vườn (theo khoảng ngày, nếu có) */
export function supplyUsedValue(data: Pick<LedgerSnapshot, 'supplies' | 'supply_usages'>, gardenId: string, range: { from?: string; to?: string } = {}): number {
  const supplies = new Map(data.supplies.map((s) => [s.id, s]));
  let sum = 0;
  for (const u of data.supply_usages) {
    const s = supplies.get(u.supply_id);
    if (!s || u.garden_id !== gardenId || (range.from && u.used_on < range.from) || (range.to && u.used_on > range.to)) continue;
    sum += Math.round(u.quantity * s.unit_price);
  }
  return sum;
}

// ---- Mùa vụ ----

/** Các vụ của 1 vườn, mới nhất trước */
export function seasonsOf(seasons: Season[], gardenId: string): Season[] {
  return seasons.filter((s) => s.garden_id === gardenId).sort((a, b) => b.started_on.localeCompare(a.started_on));
}

/** Khoảng ngày của vụ để lọc khoản thu chi (filterEntries) */
export function seasonRange(season: Pick<Season, 'started_on' | 'ended_on'>): { from: string; to?: string } {
  return season.ended_on ? { from: season.started_on, to: season.ended_on } : { from: season.started_on };
}

/** Vụ đang làm (chưa kết thúc) của vườn, nếu có */
export function currentSeason(seasons: Season[], gardenId: string): Season | undefined {
  return seasons.find((s) => s.garden_id === gardenId && s.ended_on === null);
}

/** Tên gợi ý cho vụ mới: "Vụ 2026" hoặc "Vụ 2026 (2)" nếu đã có */
export function suggestSeasonName(seasons: Season[], gardenId: string, date: string): string {
  const base = `Vụ ${date.slice(0, 4)}`;
  const names = new Set(seasonsOf(seasons, gardenId).map((s) => s.name));
  if (!names.has(base)) return base;
  let n = 2;
  while (names.has(`${base} (${n})`)) n++;
  return `${base} (${n})`;
}

// ---- Công nợ ----

export const DEBT_KIND_LABELS: Record<DebtKind, string> = {
  payable: 'Mình nợ người ta',
  receivable: 'Người ta nợ mình',
};

export interface DebtStatus {
  debt: Debt;
  paid: number;
  left: number;
  /** Quá hạn trả mà chưa trả hết */
  overdue: boolean;
}

/** Tình trạng từng khoản nợ: còn nợ trước (quá hạn lên đầu), đã trả xong sau */
export function debtStatus(data: Pick<LedgerSnapshot, 'debts' | 'debt_payments'>, today: string): DebtStatus[] {
  const paid = new Map<string, number>();
  for (const p of data.debt_payments) paid.set(p.debt_id, (paid.get(p.debt_id) ?? 0) + p.amount);
  const rank = (s: DebtStatus) => (s.left <= 0 ? 2 : s.overdue ? 0 : 1);
  return data.debts
    .map((debt) => {
      const p = paid.get(debt.id) ?? 0;
      const left = Math.max(0, debt.amount - p);
      return { debt, paid: p, left, overdue: left > 0 && !!debt.due_on && debt.due_on < today };
    })
    .sort((a, b) => rank(a) - rank(b) || b.debt.date.localeCompare(a.debt.date));
}

/** Tổng còn nợ hai chiều */
export function debtSummary(statuses: DebtStatus[]): Record<DebtKind, number> {
  const sum: Record<DebtKind, number> = { payable: 0, receivable: 0 };
  for (const s of statuses) sum[s.debt.kind] += s.left;
  return sum;
}
