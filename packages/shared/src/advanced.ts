/**
 * Sổ thu chi Nâng cao: các hàm tính thuần (không ghi dữ liệu) cho mùa vụ, kho vật tư, công nợ.
 * Dùng chung cho web, mobile và test.
 */
import type { LedgerSnapshot } from './ledger';
import { formatVnd } from './money';
import type { CutLine, Debt, DebtKind, DebtPayment, HarvestContract, HarvestCut, LenderType, LoanPlan, Season, Supply, Transaction } from './types';

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
  loan: 'Tiền mình đi vay',
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
  const sum: Record<DebtKind, number> = { payable: 0, receivable: 0, loan: 0 };
  for (const s of statuses) sum[s.debt.kind] += s.left;
  return sum;
}

// ---- Bán cho lái (cọc + cắt nhiều đợt) ----

/** Loại hàng gợi ý khi ghi đợt cắt */
export const CUT_GRADES = ['Loại A', 'Loại B', 'Loại C', 'Hàng dạt', 'Hàng kem'];

export function cutValue(lines: CutLine[]): number {
  return lines.reduce((sum, l) => sum + Math.round(l.kg * l.price), 0);
}

export function cutKg(lines: CutLine[]): number {
  return lines.reduce((sum, l) => sum + l.kg, 0);
}

export interface ContractSummary {
  contract: HarvestContract;
  cuts: HarvestCut[];
  /** Tổng giá trị hàng đã giao (= tiền vào sổ) */
  delivered: number;
  kg: number;
  /** Cọc đã trừ vào các đợt */
  deducted: number;
  /** Cọc còn lại chưa trừ (0 khi đã kết thúc bằng bỏ cọc / trả cọc) */
  depositLeft: number;
  /** Tiền lái trả thêm qua các đợt (giá trị hàng − số trừ cọc) */
  paidByCuts: number;
}

/** Tình hình từng hợp đồng: đang cắt trước, đã kết thúc sau */
export function contractSummaries(data: Pick<LedgerSnapshot, 'harvest_contracts' | 'harvest_cuts'>): ContractSummary[] {
  return data.harvest_contracts
    .map((contract) => {
      const cuts = data.harvest_cuts.filter((c) => c.contract_id === contract.id).sort((a, b) => a.date.localeCompare(b.date) || a.updated_at.localeCompare(b.updated_at));
      const delivered = cuts.reduce((s, c) => s + cutValue(c.lines), 0);
      const deducted = cuts.reduce((s, c) => s + c.deposit_deduct, 0);
      const left = contract.status === 'forfeited' || contract.status === 'refunded' ? 0 : Math.max(0, contract.deposit - deducted);
      return { contract, cuts, delivered, kg: cuts.reduce((s, c) => s + cutKg(c.lines), 0), deducted, depositLeft: left, paidByCuts: delivered - deducted };
    })
    .sort((a, b) => Number(a.contract.status !== 'open') - Number(b.contract.status !== 'open') || b.contract.date.localeCompare(a.contract.date));
}

/** Kết quả quyết toán 1 hợp đồng (dùng cho bảng quyết toán) */
export interface ContractSettlement {
  /** Tiền hàng các đợt (đã tính vào lời/lỗ) */
  delivered: number;
  /** Tiền lái thực trả = cọc + trả thêm qua các đợt − trả lại cọc */
  received: number;
  /** Số tiền trả lại lái (gồm phần đền thêm, nếu có) */
  refunded: number;
  /** Phần cọc lái bỏ (tiền vào thêm) */
  forfeited: number;
  /** Phần đền thêm cho lái (tiền ra) */
  penalty: number;
  /** Ảnh hưởng tới lời/lỗ = tiền hàng + lái bỏ cọc − đền thêm */
  profit: number;
  /** Phần cọc chưa trừ có thể trừ nốt vào tiền hàng các đợt */
  deductRoom: number;
}

export function contractSettlement(summary: ContractSummary, transactions: Transaction[]): ContractSettlement {
  const { contract, delivered, deducted, paidByCuts } = summary;
  const settle = contract.settle_transaction_id ? transactions.find((t) => t.id === contract.settle_transaction_id) : undefined;
  const leftover = Math.max(0, contract.deposit - deducted);
  const forfeited = contract.status === 'forfeited' ? (settle?.amount ?? 0) : 0;
  const penalty = contract.status === 'refunded' ? (settle?.amount ?? 0) : 0;
  const refunded = contract.status === 'refunded' ? leftover + penalty : 0;
  return {
    delivered,
    received: contract.deposit + paidByCuts - refunded,
    refunded,
    forfeited,
    penalty,
    profit: delivered + forfeited - penalty,
    deductRoom: Math.max(0, delivered - deducted),
  };
}

export const CONTRACT_STATUS_LABELS: Record<HarvestContract['status'], string> = {
  open: 'Đang cắt',
  done: 'Đã xong',
  forfeited: 'Lái bỏ cọc',
  refunded: 'Đã trả lại cọc',
};

/** Nợ gom theo người (cửa hàng mua thiếu nhiều lần): còn nợ, số lần, quá hạn */
export interface PartyDebt {
  kind: DebtKind;
  party: string;
  phone: string | null;
  count: number;
  amount: number;
  left: number;
  overdue: boolean;
  statuses: DebtStatus[];
}

export function debtsByParty(statuses: DebtStatus[]): PartyDebt[] {
  const groups = new Map<string, PartyDebt>();
  for (const s of statuses) {
    const key = `${s.debt.kind}|${s.debt.party}`;
    const g = groups.get(key) ?? { kind: s.debt.kind, party: s.debt.party, phone: null, count: 0, amount: 0, left: 0, overdue: false, statuses: [] };
    g.count++;
    g.amount += s.debt.amount;
    g.left += s.left;
    g.overdue ||= s.overdue;
    g.phone ??= s.debt.phone;
    g.statuses.push(s);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => Number(b.left > 0) - Number(a.left > 0) || Number(b.overdue) - Number(a.overdue) || b.left - a.left);
}

/** Lãi vay đã trả (theo khoảng ngày, nếu có) */
export function interestPaid(data: Pick<LedgerSnapshot, 'debt_payments'>, range: { from?: string; to?: string } = {}): number {
  return data.debt_payments
    .filter((p) => (!range.from || p.date >= range.from) && (!range.to || p.date <= range.to))
    .reduce((sum, p) => sum + (p.interest ?? 0), 0);
}

/** Lãi suất 1 tháng (số thập phân) của khoản vay: 9%/năm -> 0,0075; 1,5%/tháng -> 0,015 */
export function monthlyRate(debt: Pick<Debt, 'interest_rate' | 'rate_unit'>): number {
  if (!debt.interest_rate) return 0;
  return debt.rate_unit === 'month' ? debt.interest_rate / 100 : debt.interest_rate / 100 / 12;
}

/** Lãi ước tính 1 tháng trên dư nợ (ratePerYear: %/năm; hoặc truyền khoản vay để tính theo đơn vị của nó) */
export function monthlyInterest(left: number, rate: number | null | undefined | Pick<Debt, 'interest_rate' | 'rate_unit'>): number {
  const r = typeof rate === 'object' && rate !== null ? monthlyRate(rate) : rate ? rate / 100 / 12 : 0;
  return Math.round(left * r);
}

// ---- Khoản vay: bên cho vay, cách trả, lịch trả nợ, nhắc hạn ----

export const LENDER_TYPE_LABELS: Record<LenderType, string> = {
  bank: '🏦 Ngân hàng',
  credit_fund: '🏛️ Quỹ tín dụng',
  person: '👤 Cá nhân',
  company: '🏪 Doanh nghiệp / cửa hàng',
};

export const LOAN_PLAN_LABELS: Record<LoanPlan, { title: string; hint: string }> = {
  monthly_interest: { title: 'Trả lãi hằng tháng, gốc cuối kỳ', hint: 'Mỗi tháng trả lãi; hết hạn trả hết tiền gốc.' },
  equal_principal: { title: 'Trả góp hằng tháng (gốc + lãi)', hint: 'Mỗi tháng trả 1 phần gốc bằng nhau + lãi trên số còn nợ; lãi giảm dần.' },
  lump_sum: { title: 'Trả 1 lần cuối kỳ', hint: 'Hết hạn trả 1 lần cả gốc lẫn lãi.' },
};

/** Ngân hàng hay cho nông dân vay (tên thường gọi); người dùng vẫn gõ được tên khác */
export const VN_BANKS = [
  'Agribank',
  'Ngân hàng Chính sách xã hội',
  'Vietcombank',
  'BIDV',
  'VietinBank',
  'LPBank (Bưu điện Liên Việt)',
  'Sacombank',
  'Techcombank',
  'MB Bank',
  'ACB',
  'VPBank',
  'HDBank',
  'SHB',
  'VIB',
  'TPBank',
  'OCB',
  'SeABank',
  'Eximbank',
  'MSB',
  'Nam A Bank',
  'Bac A Bank',
  'Kienlongbank',
  'ABBANK',
  'PVcomBank',
  'Saigonbank',
  'Co-opBank (Ngân hàng Hợp tác xã)',
];

/** "2026-01-31" + 1 tháng = "2026-02-28" (ngày vượt cuối tháng thì lấy ngày cuối tháng); day: ép ngày trong tháng */
export function addMonths(date: string, months: number, day?: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(day ?? d, last)).padStart(2, '0')}`;
}

export interface Installment {
  no: number;
  due: string;
  /** Kỳ đã trả: số thật đã trả; chưa trả: số dự kiến */
  principal: number;
  interest: number;
  paid: boolean;
  overdue: boolean;
  payments: DebtPayment[];
}

export interface LoanSchedule {
  items: Installment[];
  /** Tổng lãi đến khi tất toán = lãi đã trả + lãi dự kiến các kỳ chưa trả */
  interestTotal: number;
  interestPaid: number;
  interestLeft: number;
  principalLeft: number;
  /** Kỳ chưa trả gần nhất */
  next: Installment | null;
}

/**
 * Lịch trả nợ của khoản vay có kỳ hạn + cách trả.
 * Kỳ đã trả dùng số thật; kỳ chưa trả tính lại theo dư nợ hiện tại (trả bớt gốc sớm thì lãi dự kiến giảm theo).
 * Lãi 1 kỳ = dư nợ × lãi suất tháng; trả 1 lần cuối kỳ: lãi = gốc × lãi suất tháng × số tháng.
 */
export function loanSchedule(debt: Debt, allPayments: DebtPayment[], today: string): LoanSchedule | null {
  if (debt.kind !== 'loan' || !debt.loan_plan || !debt.term_months) return null;
  const payments = allPayments.filter((p) => p.debt_id === debt.id);
  const r = monthlyRate(debt);
  const n = debt.term_months;
  const plan = debt.loan_plan;
  const principalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const interestPaid = payments.reduce((s, p) => s + (p.interest ?? 0), 0);
  let left = Math.max(0, debt.amount - principalPaid);
  const count = plan === 'lump_sum' ? 1 : n;
  const share = Math.round(debt.amount / n);
  const items: Installment[] = [];
  let unpaidLeft = count;
  for (let no = 1; no <= count; no++) {
    const due = plan === 'lump_sum' ? addMonths(debt.date, n) : addMonths(debt.date, no, debt.pay_day ?? undefined);
    const own = payments.filter((p) => p.installment === no);
    if (own.length) {
      items.push({ no, due, principal: own.reduce((s, p) => s + p.amount, 0), interest: own.reduce((s, p) => s + (p.interest ?? 0), 0), paid: true, overdue: false, payments: own });
      unpaidLeft--;
      continue;
    }
    let principal = 0;
    let interest = 0;
    if (plan === 'lump_sum') {
      principal = left;
      interest = Math.round(left * r * n);
    } else {
      interest = Math.round(left * r);
      const last = unpaidLeft === 1 || no === count;
      principal = plan === 'equal_principal' ? (last ? left : Math.min(share, left)) : last ? left : 0;
    }
    left -= principal;
    unpaidLeft--;
    items.push({ no, due, principal, interest, paid: false, overdue: due < today && principal + interest > 0, payments: [] });
  }
  // Hết nợ gốc thì các kỳ còn lại không phải trả gì
  const pending = items.filter((i) => !i.paid && i.principal + i.interest > 0);
  const interestLeft = pending.reduce((s, i) => s + i.interest, 0);
  return {
    items,
    interestTotal: interestPaid + interestLeft,
    interestPaid,
    interestLeft,
    principalLeft: Math.max(0, debt.amount - principalPaid),
    next: pending[0] ?? null,
  };
}

export interface DueReminder {
  key: string;
  debt: Debt;
  due: string;
  /** Số tiền phải trả / phải thu */
  amount: number;
  /** Khoản vay: kỳ số mấy, gốc + lãi của kỳ */
  installment: Installment | null;
  overdue: boolean;
  title: string;
}

/**
 * Các khoản sắp đến hạn (trong `days` ngày tới) hoặc đã quá hạn: kỳ trả nợ vay, nợ có hẹn ngày trả.
 * Dùng cho thẻ "Sắp đến hạn" và thông báo nhắc trên điện thoại.
 */
export function dueReminders(data: Pick<LedgerSnapshot, 'debts' | 'debt_payments'>, today: string, days = 7): DueReminder[] {
  const until = addDays(today, days);
  const result: DueReminder[] = [];
  for (const status of debtStatus(data, today)) {
    const { debt, left } = status;
    const schedule = loanSchedule(debt, data.debt_payments, today);
    if (schedule) {
      for (const it of schedule.items) {
        if (it.paid || it.principal + it.interest <= 0 || it.due > until) continue;
        const parts = [it.principal > 0 ? `gốc ${formatVnd(it.principal)}` : '', it.interest > 0 ? `lãi ${formatVnd(it.interest)}` : ''].filter(Boolean).join(' + ');
        result.push({ key: `${debt.id}:${it.no}`, debt, due: it.due, amount: it.principal + it.interest, installment: it, overdue: it.due < today, title: `${debt.party}: kỳ ${it.no}, ${parts}` });
      }
    } else if (left > 0 && debt.due_on && debt.due_on <= until) {
      const verb = debt.kind === 'receivable' ? 'thu nợ' : 'trả nợ';
      result.push({ key: debt.id, debt, due: debt.due_on, amount: left, installment: null, overdue: debt.due_on < today, title: `${debt.party}: hạn ${verb} ${formatVnd(left)}` });
    }
  }
  return result.sort((a, b) => a.due.localeCompare(b.due));
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}
