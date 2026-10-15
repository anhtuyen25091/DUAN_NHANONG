/**
 * Sổ thu chi: dữ liệu nằm trong bộ nhớ, ghi xuống máy (IndexedDB trên web, SQLite trên mobile)
 * qua LedgerStorage. Web và mobile dùng chung class này; mỗi nơi chỉ viết phần lưu trữ.
 */
import { addMonths, cutKg, cutValue, formatQty, supplyCost, supplyEntryNote } from './advanced';
import { randomUuid } from './api';
import { formatVnd } from './money';
import {
  DEFAULT_CATEGORIES,
  type Debt,
  type DebtKind,
  type DebtPayment,
  type EntryType,
  type CutLine,
  type Garden,
  type HarvestContract,
  type HarvestCut,
  type LedgerCategory,
  type LenderType,
  type LoanPlan,
  type Season,
  type StorageMode,
  type Supply,
  type SupplyUsage,
  type SyncRecord,
  type Transaction,
} from './types';

/** Bảng của sổ; các bảng sau `transactions` dùng cho chế độ Nâng cao (mùa vụ, kho vật tư, công nợ, bán cho lái) */
export const LEDGER_TABLES = [
  'gardens',
  'categories',
  'transactions',
  'seasons',
  'supplies',
  'supply_usages',
  'debts',
  'debt_payments',
  'harvest_contracts',
  'harvest_cuts',
] as const;
export type LedgerTable = (typeof LEDGER_TABLES)[number];

export interface LedgerRecords {
  gardens: Garden[];
  categories: LedgerCategory[];
  transactions: Transaction[];
  seasons: Season[];
  supplies: Supply[];
  supply_usages: SupplyUsage[];
  debts: Debt[];
  debt_payments: DebtPayment[];
  harvest_contracts: HarvestContract[];
  harvest_cuts: HarvestCut[];
}

/** Cài đặt của sổ, lưu cùng chỗ với dữ liệu */
export interface LedgerMeta {
  storage_mode?: StorageMode;
  last_garden_id?: string;
  /** Tài khoản khi bật "lưu cả trên mạng" */
  account?: { token: string; name: string; phone: string | null };
  /** Đã nhận từ server tới version này */
  sync_version?: number;
  /** Mọi thay đổi trên máy có updated_at trước mốc này đã gửi lên server */
  last_pushed_at?: string;
  /** Lần đồng bộ thành công gần nhất (giờ máy) */
  last_synced_at?: string;
  /** Bật chế độ Nâng cao: mùa vụ, kho vật tư, công nợ */
  advanced?: boolean;
}

export interface LedgerStorage {
  load(): Promise<{ records: Partial<LedgerRecords>; meta: LedgerMeta }>;
  /** Thêm hoặc ghi đè theo id */
  save(table: LedgerTable, records: SyncRecord[]): Promise<void>;
  saveMeta(meta: LedgerMeta): Promise<void>;
  /** Xóa sạch dữ liệu sổ trên máy */
  clear(): Promise<void>;
}

export interface NewEntry {
  type: EntryType;
  amount: number;
  category_id: string;
  garden_id: string | null;
  date?: string;
  note?: string | null;
}

export interface NewGarden {
  name: string;
  area_m2?: number | null;
  crop?: string | null;
  note?: string | null;
}

export interface NewSeason {
  garden_id: string;
  name: string;
  started_on: string;
  ended_on?: string | null;
}

export interface NewSupply {
  name: string;
  category_id: string;
  unit: string;
  quantity: number;
  unit_price: number;
  bought_on?: string;
  shop_name?: string | null;
  note?: string | null;
}

export interface NewUsage {
  supply_id: string;
  garden_id: string;
  quantity: number;
  used_on?: string;
  note?: string | null;
}

export interface NewDebt {
  kind: DebtKind;
  interest_rate?: number | null;
  rate_unit?: 'year' | 'month' | null;
  lender_type?: LenderType | null;
  loan_plan?: LoanPlan | null;
  term_months?: number | null;
  pay_day?: number | null;
  party: string;
  phone?: string | null;
  amount: number;
  date?: string;
  due_on?: string | null;
  garden_id?: string | null;
  note?: string | null;
}

export interface NewContract {
  garden_id: string;
  buyer: string;
  phone?: string | null;
  crop?: string | null;
  deposit: number;
  date?: string;
  category_id?: string;
  note?: string | null;
}

export interface NewCut {
  contract_id: string;
  date?: string;
  lines: CutLine[];
  deposit_deduct?: number;
  note?: string | null;
}

export interface NewPayment {
  debt_id: string;
  amount: number;
  interest?: number;
  installment?: number | null;
  date?: string;
  note?: string | null;
}

/** Ảnh chụp dữ liệu (đã bỏ bản ghi bị xóa) cho giao diện; đổi object mỗi lần dữ liệu đổi */
export interface LedgerSnapshot extends LedgerRecords {
  meta: LedgerMeta;
}

type Undo = () => Promise<void>;
type AnyRecord = LedgerRecords[LedgerTable][number];

export interface BackupFile {
  app: 'nha-nong';
  kind: 'ledger-backup';
  version: 1;
  exported_at: string;
  records: LedgerRecords;
}

type Listener = () => void;

/**
 * Hạng mục mặc định có mã cố định: máy nào cũng tạo ra cùng mã, nên khi đồng bộ 2 máy
 * chúng gộp làm một thay vì hiện "Phân bón" 2 lần.
 */
export function defaultCategoryId(index: number): string {
  return `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
}

/** "YYYY-MM-DD" theo giờ máy */
export function today(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export class Ledger {
  private tables: { [K in LedgerTable]: Map<string, LedgerRecords[K][number]> } = {
    gardens: new Map(),
    categories: new Map(),
    transactions: new Map(),
    seasons: new Map(),
    supplies: new Map(),
    supply_usages: new Map(),
    debts: new Map(),
    debt_payments: new Map(),
    harvest_contracts: new Map(),
    harvest_cuts: new Map(),
  };
  private meta: LedgerMeta = {};
  private listeners = new Set<Listener>();
  private snapshot!: LedgerSnapshot;
  /** Lỗi ghi xuống máy gần nhất (để giao diện báo) */
  lastError: Error | null = null;

  private storage: LedgerStorage;
  private now: () => Date;

  private constructor(storage: LedgerStorage, now: () => Date) {
    this.storage = storage;
    this.now = now;
  }

  static async open(storage: LedgerStorage, now: () => Date = () => new Date()): Promise<Ledger> {
    const ledger = new Ledger(storage, now);
    const { records, meta } = await storage.load();
    for (const table of LEDGER_TABLES) {
      for (const record of records[table] ?? []) {
        ledger.tables[table].set(record.id, record as never);
        ledger.observe(record.updated_at);
      }
    }
    ledger.meta = meta;
    await ledger.ensureDefaultCategories();
    ledger.refresh();
    return ledger;
  }

  // ---- Đăng ký cho React (useSyncExternalStore) ----

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): LedgerSnapshot => this.snapshot;

  private refresh() {
    const alive = <T extends SyncRecord>(map: Map<string, T>) => [...map.values()].filter((r) => r.deleted_at === null);
    this.snapshot = {
      gardens: alive(this.tables.gardens).sort((a, b) => a.name.localeCompare(b.name, 'vi')),
      categories: alive(this.tables.categories).sort((a, b) => a.sort - b.sort),
      transactions: alive(this.tables.transactions).sort((a, b) => b.date.localeCompare(a.date) || b.updated_at.localeCompare(a.updated_at)),
      seasons: alive(this.tables.seasons).sort((a, b) => b.started_on.localeCompare(a.started_on)),
      supplies: alive(this.tables.supplies).sort((a, b) => b.bought_on.localeCompare(a.bought_on) || b.updated_at.localeCompare(a.updated_at)),
      supply_usages: alive(this.tables.supply_usages).sort((a, b) => b.used_on.localeCompare(a.used_on) || b.updated_at.localeCompare(a.updated_at)),
      debts: alive(this.tables.debts).sort((a, b) => b.date.localeCompare(a.date) || b.updated_at.localeCompare(a.updated_at)),
      debt_payments: alive(this.tables.debt_payments).sort((a, b) => b.date.localeCompare(a.date) || b.updated_at.localeCompare(a.updated_at)),
      harvest_contracts: alive(this.tables.harvest_contracts).sort((a, b) => b.date.localeCompare(a.date) || b.updated_at.localeCompare(a.updated_at)),
      harvest_cuts: alive(this.tables.harvest_cuts).sort((a, b) => b.date.localeCompare(a.date) || b.updated_at.localeCompare(a.updated_at)),
      meta: { ...this.meta },
    };
    this.listeners.forEach((l) => l());
  }

  // ---- Ghi dữ liệu ----

  /** ms của lần ghi gần nhất (kể cả bản nhận từ máy khác) */
  private lastStamp = 0;

  /**
   * Thời gian ghi, luôn tăng: lớn hơn lần trước ít nhất 1 ms và lớn hơn mọi bản nhận từ máy khác.
   * Nhờ vậy 2 thao tác trong cùng 1 ms (tạo rồi xóa ngay) vẫn phân biệt được trước/sau,
   * và sửa trên máy luôn thắng bản cũ dù đồng hồ máy kia chạy nhanh.
   */
  private stamp(): string {
    this.lastStamp = Math.max(this.now().getTime(), this.lastStamp + 1);
    return new Date(this.lastStamp).toISOString();
  }

  private observe(updatedAt: string) {
    const ms = Date.parse(updatedAt);
    if (ms > this.lastStamp) this.lastStamp = ms;
  }

  private async write<K extends LedgerTable>(table: K, records: Array<LedgerRecords[K][number]>): Promise<void> {
    for (const record of records) this.tables[table].set(record.id, record as never);
    this.refresh();
    try {
      await this.storage.save(table, records);
      this.lastError = null;
    } catch (error) {
      this.lastError = error as Error;
      throw error;
    }
  }

  async setMeta(patch: LedgerMeta): Promise<void> {
    this.meta = { ...this.meta, ...patch };
    this.refresh();
    await this.storage.saveMeta(this.meta);
  }

  /** Tạo hạng mục mặc định còn thiếu (sổ cũ được thêm các mục mới như "Lãi vay") */
  private async ensureDefaultCategories() {
    const existing = [...this.tables.categories.values()];
    const missing = DEFAULT_CATEGORIES.map((c, i) => ({ c, i })).filter(
      ({ c, i }) => !this.tables.categories.has(defaultCategoryId(i)) && !existing.some((e) => e.name === c.name && e.type === c.type),
    );
    if (missing.length === 0) return;
    const at = this.stamp();
    await this.write(
      'categories',
      missing.map(({ c, i }) => ({ ...c, id: defaultCategoryId(i), sort: i, updated_at: at, deleted_at: null })),
    );
  }

  async addGarden(input: NewGarden): Promise<Garden> {
    const garden: Garden = {
      id: randomUuid(),
      name: input.name.trim(),
      area_m2: input.area_m2 ?? null,
      crop: input.crop?.trim() || null,
      note: input.note?.trim() || null,
      updated_at: this.stamp(),
      deleted_at: null,
    };
    await this.write('gardens', [garden]);
    return garden;
  }

  async updateGarden(id: string, patch: Partial<NewGarden>): Promise<void> {
    const garden = this.tables.gardens.get(id);
    if (!garden) return;
    await this.write('gardens', [{ ...garden, ...patch, updated_at: this.stamp() }]);
  }

  /**
   * Xóa vườn; các khoản và nợ của vườn chuyển thành "chi chung" để không mất tiền.
   * Mùa vụ của vườn bị xóa; vật tư đã dùng cho vườn được trả về kho. Trả về hàm hoàn tác.
   */
  async removeGarden(id: string): Promise<Undo> {
    const garden = this.tables.gardens.get(id);
    if (!garden) return async () => {};
    if (this.live('harvest_contracts').some((c) => c.garden_id === id)) throw new Error('Vườn này còn hợp đồng bán cho lái. Hãy xóa hợp đồng trước.');
    const at = this.stamp();
    const moved = this.live('transactions').filter((t) => t.garden_id === id);
    const movedDebts = this.live('debts').filter((d) => d.garden_id === id);
    await this.write('gardens', [{ ...garden, deleted_at: at, updated_at: at }]);
    if (moved.length) await this.write('transactions', moved.map((t) => ({ ...t, garden_id: null, updated_at: at })));
    if (movedDebts.length) await this.write('debts', movedDebts.map((d) => ({ ...d, garden_id: null, updated_at: at })));
    const undoChildren = await this.removeRecords([
      ...this.live('seasons').filter((s) => s.garden_id === id).map((r) => ['seasons', r] as const),
      ...this.live('supply_usages').filter((u) => u.garden_id === id).map((r) => ['supply_usages', r] as const),
    ]);
    return async () => {
      const back = this.stamp();
      await this.write('gardens', [{ ...garden, deleted_at: null, updated_at: back }]);
      if (moved.length) await this.write('transactions', moved.map((t) => ({ ...t, garden_id: id, updated_at: back })));
      if (movedDebts.length) await this.write('debts', movedDebts.map((d) => ({ ...d, garden_id: id, updated_at: back })));
      await undoChildren();
    };
  }

  async addEntry(input: NewEntry): Promise<Transaction> {
    const entry: Transaction = {
      id: randomUuid(),
      type: input.type,
      amount: Math.round(input.amount),
      date: input.date ?? today(this.now()),
      garden_id: input.garden_id,
      season_id: null,
      category_id: input.category_id,
      supply_id: null,
      note: input.note?.trim() || null,
      updated_at: this.stamp(),
      deleted_at: null,
    };
    await this.write('transactions', [entry]);
    if (input.garden_id) await this.setMeta({ last_garden_id: input.garden_id });
    return entry;
  }

  async updateEntry(id: string, patch: Partial<NewEntry>): Promise<void> {
    const entry = this.tables.transactions.get(id);
    if (!entry) return;
    await this.write('transactions', [{ ...entry, ...patch, note: patch.note === undefined ? entry.note : patch.note?.trim() || null, updated_at: this.stamp() }]);
  }

  /**
   * Xóa một khoản; trả về hàm hoàn tác (nút "Hoàn tác" hiện vài giây).
   * Khoản sinh ra khi mua vật tư / ghi nợ thì xóa luôn vật tư / khoản nợ đó, để số liệu không lệch.
   */
  async removeEntry(id: string): Promise<Undo> {
    const entry = this.tables.transactions.get(id);
    if (!entry) return async () => {};
    if (entry.supply_id && this.alive('supplies', entry.supply_id)) return this.removeSupply(entry.supply_id);
    const debt = this.live('debts').find((d) => d.transaction_id === id);
    if (debt) return this.removeDebt(debt.id);
    const cut = this.live('harvest_cuts').find((c) => c.transaction_id === id);
    if (cut) return this.removeCut(cut.id);
    const payment = this.live('debt_payments').find((p) => p.interest_transaction_id === id);
    if (payment) return this.removePayment(payment.id);
    const settled = this.live('harvest_contracts').find((c) => c.settle_transaction_id === id);
    if (settled) return this.reopenContract(settled.id);
    return this.removeRecords([['transactions', entry]]);
  }

  // ---- Chế độ Nâng cao: mùa vụ ----

  /** Vụ không được chồng ngày với vụ khác của cùng vườn; trả câu báo lỗi hoặc null */
  checkSeason(input: NewSeason, exceptId?: string): string | null {
    if (!input.name.trim()) return 'Cần đặt tên vụ.';
    if (input.ended_on && input.ended_on < input.started_on) return 'Ngày kết thúc phải sau ngày bắt đầu.';
    const clash = this.live('seasons').find(
      (s) =>
        s.garden_id === input.garden_id &&
        s.id !== exceptId &&
        s.started_on <= (input.ended_on ?? '9999-12-31') &&
        input.started_on <= (s.ended_on ?? '9999-12-31'),
    );
    return clash ? `Trùng thời gian với vụ "${clash.name}". Hãy kết thúc vụ đó trước hoặc đổi ngày.` : null;
  }

  async addSeason(input: NewSeason): Promise<Season> {
    const error = this.checkSeason(input);
    if (error) throw new Error(error);
    const season: Season = {
      id: randomUuid(),
      garden_id: input.garden_id,
      name: input.name.trim(),
      started_on: input.started_on,
      ended_on: input.ended_on || null,
      updated_at: this.stamp(),
      deleted_at: null,
    };
    await this.write('seasons', [season]);
    return season;
  }

  async updateSeason(id: string, patch: Partial<Omit<NewSeason, 'garden_id'>>): Promise<void> {
    const season = this.alive('seasons', id);
    if (!season) return;
    const next = { ...season, ...patch, name: (patch.name ?? season.name).trim(), ended_on: patch.ended_on === undefined ? season.ended_on : patch.ended_on || null };
    const error = this.checkSeason(next, id);
    if (error) throw new Error(error);
    await this.write('seasons', [{ ...next, updated_at: this.stamp() }]);
  }

  /** Xóa vụ: các khoản thu chi vẫn giữ (chỉ không còn gom theo vụ) */
  async removeSeason(id: string): Promise<Undo> {
    const season = this.alive('seasons', id);
    return season ? this.removeRecords([['seasons', season]]) : async () => {};
  }

  // ---- Chế độ Nâng cao: kho vật tư ----

  /**
   * Mua vật tư về kho: ghi 1 khoản tiền ra "chi chung".
   * on_credit: mua thiếu, ghi thêm khoản nợ đại lý. use_for: dùng hết ngay cho 1 vườn.
   */
  async addSupply(input: NewSupply & { on_credit?: boolean; use_for?: string | null }): Promise<Supply> {
    if (!(input.quantity > 0)) throw new Error('Số lượng phải lớn hơn 0.');
    const at = this.stamp();
    const supply: Supply = {
      id: randomUuid(),
      name: input.name.trim(),
      category_id: input.category_id,
      product_id: null,
      unit: input.unit.trim() || 'cái',
      quantity: input.quantity,
      unit_price: input.unit_price,
      bought_on: input.bought_on ?? today(this.now()),
      shop_name: input.shop_name?.trim() || null,
      note: input.note?.trim() || null,
      updated_at: at,
      deleted_at: null,
    };
    const entry: Transaction = {
      id: randomUuid(),
      type: 'expense',
      amount: supplyCost(supply),
      date: supply.bought_on,
      garden_id: null,
      season_id: null,
      category_id: supply.category_id,
      supply_id: supply.id,
      note: supplyEntryNote(supply),
      updated_at: at,
      deleted_at: null,
    };
    await this.write('supplies', [supply]);
    await this.write('transactions', [entry]);
    if (input.on_credit) {
      await this.write('debts', [
        {
          id: randomUuid(),
          kind: 'payable',
          party: supply.shop_name ?? 'Đại lý',
          phone: null,
          amount: entry.amount,
          date: supply.bought_on,
          due_on: null,
          garden_id: null,
          transaction_id: null,
          supply_id: supply.id,
          note: `Mua thiếu ${supplyEntryNote(supply)}`,
          updated_at: at,
          deleted_at: null,
        },
      ]);
    }
    if (input.use_for) await this.useSupply({ supply_id: supply.id, garden_id: input.use_for, quantity: supply.quantity, used_on: supply.bought_on });
    return supply;
  }

  /** Sửa vật tư: khoản tiền ra (và khoản nợ mua thiếu, nếu có) đổi theo */
  async updateSupply(id: string, patch: Partial<NewSupply>): Promise<void> {
    const supply = this.alive('supplies', id);
    if (!supply) return;
    const used = this.usedQuantity(id);
    if (patch.quantity !== undefined && patch.quantity < used) throw new Error(`Đã dùng ${formatQty(used)} ${supply.unit}, số lượng không thể ít hơn.`);
    const debt = this.live('debts').find((d) => d.supply_id === id);
    const newCost = supplyCost({ quantity: patch.quantity ?? supply.quantity, unit_price: patch.unit_price ?? supply.unit_price });
    const paid = debt ? this.paidAmount(debt.id) : 0;
    if (debt && newCost < paid) throw new Error(`Đã trả ${formatVnd(paid)} cho khoản mua thiếu này, thành tiền không thể ít hơn.`);
    const at = this.stamp();
    const next: Supply = {
      ...supply,
      ...patch,
      name: (patch.name ?? supply.name).trim(),
      unit_price: patch.unit_price ?? supply.unit_price,
      shop_name: patch.shop_name === undefined ? supply.shop_name : patch.shop_name?.trim() || null,
      note: patch.note === undefined ? supply.note : patch.note?.trim() || null,
      updated_at: at,
    };
    await this.write('supplies', [next]);
    const entry = this.live('transactions').find((t) => t.supply_id === id);
    if (entry) {
      await this.write('transactions', [{ ...entry, amount: supplyCost(next), date: next.bought_on, category_id: next.category_id, note: supplyEntryNote(next), updated_at: at }]);
    }
    if (debt) await this.write('debts', [{ ...debt, amount: supplyCost(next), date: next.bought_on, party: next.shop_name ?? debt.party, updated_at: at }]);
  }

  /** Xóa vật tư cùng khoản tiền ra, các lần dùng, khoản nợ mua thiếu */
  async removeSupply(id: string): Promise<Undo> {
    const supply = this.alive('supplies', id);
    if (!supply) return async () => {};
    const debts = this.live('debts').filter((d) => d.supply_id === id);
    return this.removeRecords([
      ['supplies', supply],
      ...this.live('transactions').filter((t) => t.supply_id === id).map((r) => ['transactions', r] as const),
      ...this.live('supply_usages').filter((u) => u.supply_id === id).map((r) => ['supply_usages', r] as const),
      ...debts.map((r) => ['debts', r] as const),
      ...this.live('debt_payments').filter((p) => debts.some((d) => d.id === p.debt_id)).map((r) => ['debt_payments', r] as const),
    ]);
  }

  usedQuantity(supplyId: string, exceptUsageId?: string): number {
    return this.live('supply_usages')
      .filter((u) => u.supply_id === supplyId && u.id !== exceptUsageId)
      .reduce((sum, u) => sum + u.quantity, 0);
  }

  /** Lấy vật tư trong kho dùng cho 1 vườn */
  async useSupply(input: NewUsage): Promise<SupplyUsage> {
    const supply = this.alive('supplies', input.supply_id);
    if (!supply) throw new Error('Không tìm thấy vật tư.');
    if (!(input.quantity > 0)) throw new Error('Số lượng phải lớn hơn 0.');
    const left = supply.quantity - this.usedQuantity(supply.id);
    if (input.quantity > left + 1e-9) throw new Error(`Trong kho chỉ còn ${formatQty(left)} ${supply.unit}.`);
    const usage: SupplyUsage = {
      id: randomUuid(),
      supply_id: supply.id,
      garden_id: input.garden_id,
      quantity: input.quantity,
      used_on: input.used_on ?? today(this.now()),
      note: input.note?.trim() || null,
      updated_at: this.stamp(),
      deleted_at: null,
    };
    await this.write('supply_usages', [usage]);
    await this.setMeta({ last_garden_id: input.garden_id });
    return usage;
  }

  async removeUsage(id: string): Promise<Undo> {
    const usage = this.alive('supply_usages', id);
    return usage ? this.removeRecords([['supply_usages', usage]]) : async () => {};
  }

  // ---- Chế độ Nâng cao: công nợ ----

  /**
   * Ghi nợ. record_entry (mặc định có): ghi luôn khoản tiền ra (mình mua thiếu) / tiền vào (bán chịu)
   * để lời/lỗ tính đúng; bỏ chọn khi khoản đó đã ghi trong sổ rồi.
   */
  async addDebt(input: NewDebt & { record_entry?: boolean; category_id?: string }): Promise<Debt> {
    if (!(input.amount > 0)) throw new Error('Số tiền phải lớn hơn 0.');
    if (!input.party.trim()) throw new Error('Cần ghi tên người / đại lý.');
    const at = this.stamp();
    const date = input.date ?? today(this.now());
    let entry: Transaction | null = null;
    // Tiền vay là tiền mượn, không phải tiền vào: không ghi vào sổ thu chi
    if (input.record_entry !== false && input.kind !== 'loan') {
      const type: EntryType = input.kind === 'payable' ? 'expense' : 'income';
      const categoryId = input.category_id ?? this.snapshot.categories.find((c) => c.type === type)?.id;
      if (!categoryId) throw new Error('Chưa có hạng mục để ghi khoản này.');
      entry = {
        id: randomUuid(),
        type,
        amount: Math.round(input.amount),
        date,
        garden_id: input.garden_id ?? null,
        season_id: null,
        category_id: categoryId,
        supply_id: null,
        note: `${input.kind === 'payable' ? 'Mua thiếu' : 'Bán chịu'}: ${input.party.trim()}${input.note?.trim() ? ` · ${input.note.trim()}` : ''}`,
        updated_at: at,
        deleted_at: null,
      };
      await this.write('transactions', [entry]);
    }
    const debt: Debt = {
      id: randomUuid(),
      kind: input.kind,
      party: input.party.trim(),
      phone: input.phone?.trim() || null,
      amount: Math.round(input.amount),
      date,
      due_on: input.due_on || null,
      garden_id: input.garden_id ?? null,
      transaction_id: entry?.id ?? null,
      supply_id: null,
      ...(input.kind === 'loan' ? loanTerms(input, date) : { interest_rate: null }),
      note: input.note?.trim() || null,
      updated_at: at,
      deleted_at: null,
    };
    await this.write('debts', [debt]);
    return debt;
  }

  /** Sửa khoản nợ; khoản thu chi đi kèm đổi theo số tiền / ngày / vườn */
  async updateDebt(id: string, patch: Partial<Omit<NewDebt, 'kind'>>): Promise<void> {
    const debt = this.alive('debts', id);
    if (!debt) return;
    const paid = this.paidAmount(id);
    // Nợ mua thiếu vật tư: số tiền đi theo thành tiền vật tư, sửa ở vật tư để 2 bên không lệch
    if (debt.supply_id && patch.amount !== undefined && Math.round(patch.amount) !== debt.amount) throw new Error('Khoản nợ này đi theo vật tư mua thiếu. Hãy sửa số lượng / giá ở vật tư.');
    if (patch.amount !== undefined && patch.amount < paid) throw new Error(`Đã trả ${formatVnd(paid)}, số nợ không thể ít hơn.`);
    const at = this.stamp();
    const next: Debt = {
      ...debt,
      ...patch,
      party: (patch.party ?? debt.party).trim(),
      amount: Math.round(patch.amount ?? debt.amount),
      phone: patch.phone === undefined ? debt.phone : patch.phone?.trim() || null,
      due_on: patch.due_on === undefined ? debt.due_on : patch.due_on || null,
      garden_id: patch.garden_id === undefined ? debt.garden_id : patch.garden_id,
      note: patch.note === undefined ? debt.note : patch.note?.trim() || null,
      ...(debt.kind === 'loan' ? loanTerms({ ...debt, ...patch }, patch.date ?? debt.date) : {}),
      updated_at: at,
    };
    await this.write('debts', [next]);
    const entry = debt.transaction_id ? this.alive('transactions', debt.transaction_id) : undefined;
    if (entry) await this.write('transactions', [{ ...entry, amount: next.amount, date: next.date, garden_id: next.garden_id, updated_at: at }]);
  }

  /** Xóa khoản nợ cùng các lần trả và khoản thu chi đi kèm */
  async removeDebt(id: string): Promise<Undo> {
    const debt = this.alive('debts', id);
    if (!debt) return async () => {};
    const entry = debt.transaction_id ? this.alive('transactions', debt.transaction_id) : undefined;
    const payments = this.live('debt_payments').filter((p) => p.debt_id === id);
    const interestIds = new Set(payments.map((p) => p.interest_transaction_id).filter(Boolean));
    return this.removeRecords([
      ['debts', debt],
      ...(entry ? [['transactions', entry] as const] : []),
      ...payments.map((r) => ['debt_payments', r] as const),
      ...this.live('transactions').filter((t) => interestIds.has(t.id)).map((r) => ['transactions', r] as const),
    ]);
  }

  paidAmount(debtId: string, exceptPaymentId?: string): number {
    return this.live('debt_payments')
      .filter((p) => p.debt_id === debtId && p.id !== exceptPaymentId)
      .reduce((sum, p) => sum + p.amount, 0);
  }

  /**
   * Ghi 1 lần trả nợ (mình trả đại lý / trả nợ vay) hoặc thu nợ (người mua trả mình).
   * amount: tiền gốc; interest (khoản vay): tiền lãi trả kèm, ghi thành tiền ra hạng mục "Lãi vay".
   */
  async payDebt(input: NewPayment): Promise<DebtPayment> {
    const debt = this.alive('debts', input.debt_id);
    if (!debt) throw new Error('Không tìm thấy khoản nợ.');
    const amount = Math.round(input.amount);
    const interest = debt.kind === 'loan' ? Math.round(input.interest ?? 0) : 0;
    if (amount < 0 || interest < 0 || amount + interest <= 0) throw new Error('Số tiền phải lớn hơn 0.');
    const left = debt.amount - this.paidAmount(debt.id);
    if (amount > left) throw new Error(`Chỉ còn nợ ${formatVnd(left)}.`);
    const at = this.stamp();
    const date = input.date ?? today(this.now());
    let interestEntry: Transaction | null = null;
    if (interest > 0) {
      interestEntry = {
        id: randomUuid(),
        type: 'expense',
        amount: interest,
        date,
        garden_id: debt.garden_id,
        season_id: null,
        category_id: this.categoryByName('expense', 'Lãi vay'),
        supply_id: null,
        note: `Lãi vay ${debt.party}`,
        updated_at: at,
        deleted_at: null,
      };
      await this.write('transactions', [interestEntry]);
    }
    const payment: DebtPayment = {
      id: randomUuid(),
      debt_id: debt.id,
      amount,
      interest,
      interest_transaction_id: interestEntry?.id ?? null,
      installment: debt.kind === 'loan' ? (input.installment ?? null) : null,
      date,
      note: input.note?.trim() || null,
      updated_at: at,
      deleted_at: null,
    };
    await this.write('debt_payments', [payment]);
    return payment;
  }

  /**
   * Trả gộp cho 1 người (ví dụ cửa hàng phân bón mua thiếu nhiều lần): trừ vào khoản nợ cũ nhất trước.
   * Trả về số khoản nợ đã ghi trả.
   */
  async payParty(input: { kind: DebtKind; party: string; amount: number; date?: string }): Promise<number> {
    let rest = Math.round(input.amount);
    if (rest <= 0) throw new Error('Số tiền phải lớn hơn 0.');
    const open = this.live('debts')
      .filter((d) => d.kind === input.kind && d.party === input.party)
      .map((d) => ({ d, left: d.amount - this.paidAmount(d.id) }))
      .filter((x) => x.left > 0)
      .sort((a, b) => a.d.date.localeCompare(b.d.date) || a.d.updated_at.localeCompare(b.d.updated_at));
    const total = open.reduce((s, x) => s + x.left, 0);
    if (rest > total) throw new Error(`${input.party} chỉ còn ${formatVnd(total)}.`);
    let count = 0;
    for (const { d, left } of open) {
      if (rest <= 0) break;
      const pay = Math.min(left, rest);
      await this.payDebt({ debt_id: d.id, amount: pay, date: input.date, note: 'Trả gộp' });
      rest -= pay;
      count++;
    }
    return count;
  }

  async removePayment(id: string): Promise<Undo> {
    const payment = this.alive('debt_payments', id);
    if (!payment) return async () => {};
    const interest = payment.interest_transaction_id ? this.alive('transactions', payment.interest_transaction_id) : undefined;
    return this.removeRecords([['debt_payments', payment], ...(interest ? [['transactions', interest] as const] : [])]);
  }

  // ---- Chế độ Nâng cao: bán cho lái (cọc + cắt nhiều đợt) ----

  /** Nhận cọc của lái. Cọc chưa tính vào lời/lỗ: chỉ tính khi giao hàng (từng đợt) hoặc lái bỏ cọc. */
  async addContract(input: NewContract): Promise<HarvestContract> {
    if (!input.buyer.trim()) throw new Error('Cần ghi tên lái.');
    if (!(input.deposit >= 0)) throw new Error('Tiền cọc không hợp lệ.');
    const contract: HarvestContract = {
      id: randomUuid(),
      garden_id: input.garden_id,
      buyer: input.buyer.trim(),
      phone: input.phone?.trim() || null,
      crop: input.crop?.trim() || null,
      deposit: Math.round(input.deposit),
      date: input.date ?? today(this.now()),
      category_id: input.category_id ?? this.incomeCategory('Bán nông sản'),
      status: 'open',
      closed_on: null,
      settle_transaction_id: null,
      note: input.note?.trim() || null,
      updated_at: this.stamp(),
      deleted_at: null,
    };
    await this.write('harvest_contracts', [contract]);
    return contract;
  }

  async updateContract(id: string, patch: Partial<Omit<NewContract, 'garden_id'>>): Promise<void> {
    const contract = this.alive('harvest_contracts', id);
    if (!contract) return;
    const deducted = this.deductedFor(id);
    if (patch.deposit !== undefined && patch.deposit < deducted) throw new Error(`Đã trừ ${formatVnd(deducted)} cọc vào các đợt, tiền cọc không thể ít hơn.`);
    const at = this.stamp();
    const next: HarvestContract = {
      ...contract,
      ...patch,
      buyer: (patch.buyer ?? contract.buyer).trim(),
      phone: patch.phone === undefined ? contract.phone : patch.phone?.trim() || null,
      crop: patch.crop === undefined ? contract.crop : patch.crop?.trim() || null,
      note: patch.note === undefined ? contract.note : patch.note?.trim() || null,
      deposit: Math.round(patch.deposit ?? contract.deposit),
      updated_at: at,
    };
    await this.write('harvest_contracts', [next]);
    // Đổi tên lái / hạng mục: ghi chú và hạng mục của các đợt đổi theo
    for (const cut of this.live('harvest_cuts').filter((c) => c.contract_id === id)) {
      const entry = cut.transaction_id ? this.alive('transactions', cut.transaction_id) : undefined;
      if (entry) await this.write('transactions', [{ ...entry, category_id: next.category_id, note: this.cutNote(next, cut), updated_at: at }]);
    }
  }

  /** Xóa hợp đồng cùng các đợt cắt và khoản thu chi đi kèm */
  async removeContract(id: string): Promise<Undo> {
    const contract = this.alive('harvest_contracts', id);
    if (!contract) return async () => {};
    const cuts = this.live('harvest_cuts').filter((c) => c.contract_id === id);
    const entryIds = new Set([...cuts.map((c) => c.transaction_id), contract.settle_transaction_id].filter(Boolean));
    return this.removeRecords([
      ['harvest_contracts', contract],
      ...cuts.map((r) => ['harvest_cuts', r] as const),
      ...this.live('transactions').filter((t) => entryIds.has(t.id)).map((r) => ['transactions', r] as const),
    ]);
  }

  /** Ghi 1 đợt cắt: tiền vào = giá trị hàng; deposit_deduct: số cọc trừ vào đợt này */
  async addCut(input: NewCut): Promise<HarvestCut> {
    const contract = this.alive('harvest_contracts', input.contract_id);
    if (!contract) throw new Error('Không tìm thấy hợp đồng.');
    if (contract.status !== 'open') throw new Error('Hợp đồng đã kết thúc. Mở lại để ghi thêm đợt.');
    const lines = this.cleanLines(input.lines);
    const value = cutValue(lines);
    const deduct = Math.round(input.deposit_deduct ?? 0);
    this.checkDeduct(contract, deduct, value);
    const at = this.stamp();
    const cut: HarvestCut = {
      id: randomUuid(),
      contract_id: contract.id,
      date: input.date ?? today(this.now()),
      lines,
      deposit_deduct: deduct,
      transaction_id: null,
      note: input.note?.trim() || null,
      updated_at: at,
      deleted_at: null,
    };
    const entry: Transaction = {
      id: randomUuid(),
      type: 'income',
      amount: value,
      date: cut.date,
      garden_id: contract.garden_id,
      season_id: null,
      category_id: contract.category_id,
      supply_id: null,
      note: this.cutNote(contract, cut),
      updated_at: at,
      deleted_at: null,
    };
    cut.transaction_id = entry.id;
    await this.write('transactions', [entry]);
    await this.write('harvest_cuts', [cut]);
    return cut;
  }

  async updateCut(id: string, patch: Partial<Omit<NewCut, 'contract_id'>>): Promise<void> {
    const cut = this.alive('harvest_cuts', id);
    const contract = cut && this.alive('harvest_contracts', cut.contract_id);
    if (!cut || !contract) return;
    const lines = patch.lines ? this.cleanLines(patch.lines) : cut.lines;
    const deduct = Math.round(patch.deposit_deduct ?? cut.deposit_deduct);
    this.checkDeduct(contract, deduct, cutValue(lines), cut.id);
    const at = this.stamp();
    const next: HarvestCut = { ...cut, ...patch, lines, deposit_deduct: deduct, note: patch.note === undefined ? cut.note : patch.note?.trim() || null, updated_at: at };
    await this.write('harvest_cuts', [next]);
    const entry = cut.transaction_id ? this.alive('transactions', cut.transaction_id) : undefined;
    if (entry) await this.write('transactions', [{ ...entry, amount: cutValue(lines), date: next.date, note: this.cutNote(contract, next), updated_at: at }]);
  }

  async removeCut(id: string): Promise<Undo> {
    const cut = this.alive('harvest_cuts', id);
    if (!cut) return async () => {};
    const entry = cut.transaction_id ? this.alive('transactions', cut.transaction_id) : undefined;
    return this.removeRecords([['harvest_cuts', cut], ...(entry ? [['transactions', entry] as const] : [])]);
  }

  /** Lái bỏ cọc (không vào cắt nữa): phần cọc chưa trừ thành tiền vào của mình */
  async forfeitDeposit(contractId: string, date?: string): Promise<void> {
    const contract = this.openContract(contractId);
    const left = contract.deposit - this.deductedFor(contractId);
    const at = this.stamp();
    let entry: Transaction | null = null;
    if (left > 0) {
      entry = {
        id: randomUuid(),
        type: 'income',
        amount: left,
        date: date ?? today(this.now()),
        garden_id: contract.garden_id,
        season_id: null,
        category_id: this.incomeCategory('Thu khác'),
        supply_id: null,
        note: `Lái ${contract.buyer} bỏ cọc`,
        updated_at: at,
        deleted_at: null,
      };
      await this.write('transactions', [entry]);
    }
    await this.write('harvest_contracts', [{ ...contract, status: 'forfeited', closed_on: date ?? today(this.now()), settle_transaction_id: entry?.id ?? null, updated_at: at }]);
  }

  /**
   * Trả lại cọc cho lái (mình không bán nữa). amount: số tiền trả lại thật.
   * Trả đúng phần cọc chưa trừ thì không đổi lời/lỗ; trả nhiều hơn (đền cọc) thì phần dư là tiền ra.
   */
  async refundDeposit(contractId: string, amount: number, date?: string): Promise<void> {
    const contract = this.openContract(contractId);
    const left = contract.deposit - this.deductedFor(contractId);
    if (Math.round(amount) < left) throw new Error(`Cọc còn ${formatVnd(left)}, số trả lại không thể ít hơn. Nếu lái chịu mất một phần cọc, hãy ghi "Lái bỏ cọc".`);
    const extra = Math.round(amount) - left;
    const at = this.stamp();
    let entry: Transaction | null = null;
    if (extra > 0) {
      entry = {
        id: randomUuid(),
        type: 'expense',
        amount: extra,
        date: date ?? today(this.now()),
        garden_id: contract.garden_id,
        season_id: null,
        category_id: this.snapshot.categories.find((c) => c.type === 'expense' && c.name === 'Khác')?.id ?? this.snapshot.categories.find((c) => c.type === 'expense')!.id,
        supply_id: null,
        note: `Đền cọc cho lái ${contract.buyer}`,
        updated_at: at,
        deleted_at: null,
      };
      await this.write('transactions', [entry]);
    }
    await this.write('harvest_contracts', [{ ...contract, status: 'refunded', closed_on: date ?? today(this.now()), settle_transaction_id: entry?.id ?? null, updated_at: at }]);
  }

  /** Cắt xong, cọc đã trừ hết: đóng hợp đồng */
  async closeContract(contractId: string, date?: string): Promise<void> {
    const contract = this.openContract(contractId);
    const left = contract.deposit - this.deductedFor(contractId);
    if (left > 0) throw new Error(`Còn ${formatVnd(left)} cọc chưa trừ. Hãy trừ vào đợt cuối, trả lại cọc, hoặc ghi lái bỏ cọc.`);
    await this.write('harvest_contracts', [{ ...contract, status: 'done', closed_on: date ?? today(this.now()), updated_at: this.stamp() }]);
  }

  /** Mở lại hợp đồng đã kết thúc (xóa khoản bỏ cọc / đền cọc nếu có) */
  async reopenContract(contractId: string): Promise<Undo> {
    const contract = this.alive('harvest_contracts', contractId);
    if (!contract || contract.status === 'open') return async () => {};
    const entry = contract.settle_transaction_id ? this.alive('transactions', contract.settle_transaction_id) : undefined;
    const at = this.stamp();
    if (entry) await this.write('transactions', [{ ...entry, deleted_at: at, updated_at: at }]);
    await this.write('harvest_contracts', [{ ...contract, status: 'open', closed_on: null, settle_transaction_id: null, updated_at: at }]);
    return async () => {
      const back = this.stamp();
      if (entry) await this.write('transactions', [{ ...entry, deleted_at: null, updated_at: back }]);
      await this.write('harvest_contracts', [{ ...contract, updated_at: back }]);
    };
  }

  private openContract(id: string): HarvestContract {
    const contract = this.alive('harvest_contracts', id);
    if (!contract) throw new Error('Không tìm thấy hợp đồng.');
    if (contract.status !== 'open') throw new Error('Hợp đồng đã kết thúc.');
    return contract;
  }

  private deductedFor(contractId: string, exceptCutId?: string): number {
    return this.live('harvest_cuts')
      .filter((c) => c.contract_id === contractId && c.id !== exceptCutId)
      .reduce((sum, c) => sum + c.deposit_deduct, 0);
  }

  private checkDeduct(contract: HarvestContract, deduct: number, value: number, exceptCutId?: string) {
    if (deduct < 0) throw new Error('Số trừ cọc không hợp lệ.');
    const left = contract.deposit - this.deductedFor(contract.id, exceptCutId);
    if (deduct > left) throw new Error(`Cọc chỉ còn ${formatVnd(left)} để trừ.`);
    if (deduct > value) throw new Error(`Số trừ cọc không thể lớn hơn tiền hàng đợt này (${formatVnd(value)}).`);
  }

  private cleanLines(lines: CutLine[]): CutLine[] {
    const clean = lines.filter((l) => l.kg > 0).map((l) => ({ grade: l.grade.trim() || 'Hàng', kg: l.kg, price: Math.round(l.price) }));
    if (clean.length === 0) throw new Error('Cần ghi ít nhất 1 loại hàng có số kg.');
    if (clean.some((l) => !(l.price > 0))) throw new Error('Cần ghi giá cho mỗi loại hàng.');
    return clean;
  }

  private cutNote(contract: HarvestContract, cut: Pick<HarvestCut, 'contract_id' | 'lines' | 'id' | 'date'>): string {
    const order = this.live('harvest_cuts')
      .filter((c) => c.contract_id === contract.id && c.id !== cut.id)
      .filter((c) => c.date <= cut.date).length + 1;
    return `Đợt ${order} · lái ${contract.buyer} · ${formatQty(cutKg(cut.lines))} kg`;
  }

  private incomeCategory(name: string): string {
    return this.categoryByName('income', name);
  }

  private categoryByName(type: EntryType, name: string): string {
    const list = this.snapshot.categories.filter((c) => c.type === type);
    return (list.find((c) => c.name === name) ?? list[0]).id;
  }

  // ---- Tiện ích nội bộ ----

  private live<K extends LedgerTable>(table: K): Array<LedgerRecords[K][number]> {
    return [...this.tables[table].values()].filter((r) => r.deleted_at === null) as never;
  }

  private alive<K extends LedgerTable>(table: K, id: string): LedgerRecords[K][number] | undefined {
    const record = this.tables[table].get(id);
    return record && record.deleted_at === null ? record : undefined;
  }

  /** Đánh dấu xóa nhiều bản ghi cùng lúc; trả về hàm hoàn tác */
  private async removeRecords(items: ReadonlyArray<readonly [LedgerTable, AnyRecord]>): Promise<Undo> {
    if (items.length === 0) return async () => {};
    const at = this.stamp();
    await this.writeGrouped(items.map(([table, r]) => [table, { ...r, deleted_at: at, updated_at: at }]));
    return async () => {
      const back = this.stamp();
      await this.writeGrouped(items.map(([table, r]) => [table, { ...r, deleted_at: null, updated_at: back }]));
    };
  }

  private async writeGrouped(items: Array<[LedgerTable, AnyRecord]>) {
    for (const table of LEDGER_TABLES) {
      const records = items.filter(([t]) => t === table).map(([, r]) => r);
      if (records.length) await this.write(table, records as never);
    }
  }

  /** Vườn mẫu để người dùng bấm thử; xóa như vườn bình thường */
  async createSampleGarden(): Promise<Garden> {
    const garden = await this.addGarden({ name: 'Vườn mẫu (bấm thử)', crop: 'Cà phê', area_m2: 5000 });
    const cat = (name: string) => this.snapshot.categories.find((c) => c.name === name)?.id ?? this.snapshot.categories[0].id;
    const day = (offset: number) => today(new Date(this.now().getTime() - offset * 86_400_000));
    const samples: NewEntry[] = [
      { type: 'expense', amount: 2_400_000, category_id: cat('Phân bón'), garden_id: garden.id, date: day(40), note: '4 bao NPK' },
      { type: 'expense', amount: 350_000, category_id: cat('Thuốc'), garden_id: garden.id, date: day(25), note: 'Xịt thuốc rệp' },
      { type: 'expense', amount: 1_500_000, category_id: cat('Nhân công'), garden_id: garden.id, date: day(10), note: '5 công làm cỏ' },
      { type: 'income', amount: 9_000_000, category_id: cat('Bán nông sản'), garden_id: garden.id, date: day(3), note: '100 kg cà phê nhân' },
    ];
    for (const sample of samples) await this.addEntry(sample);
    return garden;
  }

  // ---- Sao lưu ----

  /** Toàn bộ bản ghi, kể cả đã xóa (để đồng bộ / sao lưu giữ đúng trạng thái) */
  allRecords(): LedgerRecords {
    return Object.fromEntries(LEDGER_TABLES.map((table) => [table, [...this.tables[table].values()]])) as unknown as LedgerRecords;
  }

  /** Các bản ghi đổi sau mốc `since` (chưa gửi lên server); không có mốc = tất cả */
  changedSince(since?: string): Array<{ tbl: LedgerTable; data: SyncRecord }> {
    const result: Array<{ tbl: LedgerTable; data: SyncRecord }> = [];
    for (const table of LEDGER_TABLES) {
      for (const record of this.tables[table].values()) {
        if (!since || record.updated_at > since) result.push({ tbl: table, data: record });
      }
    }
    return result;
  }

  /** Giờ hiện tại theo đồng hồ của sổ (để đặt mốc đồng bộ) */
  clock(): string {
    return this.stamp();
  }

  exportBackup(): BackupFile {
    return { app: 'nha-nong', kind: 'ledger-backup', version: 1, exported_at: this.stamp(), records: this.allRecords() };
  }

  /**
   * Gộp bản ghi từ nơi khác (file sao lưu hoặc server): bản nào updated_at mới hơn thì thắng.
   * Trả về số bản ghi đã thay đổi trên máy.
   */
  async merge(records: Partial<LedgerRecords>): Promise<number> {
    let changed = 0;
    for (const table of LEDGER_TABLES) {
      const incoming = (records[table] ?? []) as Array<LedgerRecords[typeof table][number]>;
      const newer = incoming.filter((r) => {
        const current = this.tables[table].get(r.id);
        return !current || r.updated_at > current.updated_at;
      });
      for (const r of incoming) this.observe(r.updated_at);
      if (newer.length) {
        await this.write(table, newer as never);
        changed += newer.length;
      }
    }
    return changed;
  }

  async importBackup(text: string): Promise<number> {
    const file = parseBackup(text);
    return this.merge(file.records);
  }

  /** Xóa hết sổ trên máy (tạo lại hạng mục mặc định) */
  async reset(): Promise<void> {
    await this.storage.clear();
    for (const table of LEDGER_TABLES) this.tables[table].clear();
    this.meta = {};
    await this.ensureDefaultCategories();
    this.refresh();
  }
}

export function parseBackup(text: string): BackupFile {
  let file: BackupFile;
  try {
    file = JSON.parse(text);
  } catch {
    throw new Error('File không đúng định dạng sao lưu của Nhà Nông.');
  }
  if (file?.app !== 'nha-nong' || file.kind !== 'ledger-backup' || typeof file.records !== 'object') {
    throw new Error('File không đúng định dạng sao lưu của Nhà Nông.');
  }
  for (const table of LEDGER_TABLES) {
    const rows = file.records[table] ?? [];
    if (!Array.isArray(rows) || rows.some((r) => typeof r?.id !== 'string' || typeof r?.updated_at !== 'string')) {
      throw new Error('File sao lưu bị hỏng hoặc thiếu dữ liệu.');
    }
  }
  return file;
}

// ---- Tổng kết (hàm thuần, dùng cho cả màn hình và test) ----

export interface Totals {
  income: number;
  expense: number;
  /** income - expense; dương = lời, âm = lỗ */
  profit: number;
}

export interface EntryFilter {
  /** undefined = mọi vườn, null = chỉ chi chung */
  gardenId?: string | null;
  from?: string;
  to?: string;
  type?: EntryType;
}

export function filterEntries(entries: Transaction[], filter: EntryFilter = {}): Transaction[] {
  return entries.filter(
    (t) =>
      (filter.gardenId === undefined || t.garden_id === filter.gardenId) &&
      (!filter.from || t.date >= filter.from) &&
      (!filter.to || t.date <= filter.to) &&
      (!filter.type || t.type === filter.type),
  );
}

export function totals(entries: Transaction[]): Totals {
  let income = 0;
  let expense = 0;
  for (const t of entries) {
    if (t.type === 'income') income += t.amount;
    else expense += t.amount;
  }
  return { income, expense, profit: income - expense };
}

/** Thu/chi theo tháng, đủ `months` tháng gần nhất tính đến tháng của `until` (kể cả tháng trống) */
export function monthlyTotals(entries: Transaction[], months: number, until: string): Array<Totals & { month: string }> {
  const [y, m] = until.split('-').map(Number);
  const result: Array<Totals & { month: string }> = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    result.push({ month, ...totals(entries.filter((t) => t.date.startsWith(month))) });
  }
  return result;
}

/** Tổng theo hạng mục, nhiều tiền nhất trước */
export function totalsByCategory(entries: Transaction[]): Array<{ category_id: string; amount: number }> {
  const sums = new Map<string, number>();
  for (const t of entries) sums.set(t.category_id, (sums.get(t.category_id) ?? 0) + t.amount);
  return [...sums].map(([category_id, amount]) => ({ category_id, amount })).sort((a, b) => b.amount - a.amount);
}

/** Gom theo ngày để hiển thị danh sách (giữ thứ tự mới nhất trước) */
export function groupByDate(entries: Transaction[]): Array<{ date: string; entries: Transaction[] }> {
  const groups: Array<{ date: string; entries: Transaction[] }> = [];
  for (const t of entries) {
    const last = groups[groups.length - 1];
    if (last?.date === t.date) last.entries.push(t);
    else groups.push({ date: t.date, entries: [t] });
  }
  return groups;
}

// ---- Bàn phím nhập tiền ----

export type AmountKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '000' | 'nghìn' | 'triệu' | 'xóa' | 'C';

/** Tối đa 999 tỷ, đủ cho mọi khoản của một nhà vườn */
const MAX_AMOUNT = 999_999_999_999;

/**
 * Bấm một phím trên bàn phím tiền.
 * "nghìn" nhân số đang gõ với 1.000, "triệu" nhân với 1.000.000 (gõ 15 rồi "triệu" = 15.000.000).
 */
export function pressAmountKey(amount: number, key: AmountKey): number {
  let next: number;
  switch (key) {
    case 'C':
      return 0;
    case 'xóa':
      return Math.floor(amount / 10);
    case '000':
    case 'nghìn':
      next = amount * 1000;
      break;
    case 'triệu':
      next = amount * 1_000_000;
      break;
    default:
      next = amount * 10 + Number(key);
  }
  return next > MAX_AMOUNT ? amount : next;
}

/** Điều khoản khoản vay đã chuẩn hóa; hạn trả (due_on) = ngày vay + kỳ hạn */
function loanTerms(input: Partial<NewDebt>, date: string): Pick<Debt, 'interest_rate' | 'rate_unit' | 'lender_type' | 'loan_plan' | 'term_months' | 'pay_day'> & { due_on?: string | null } {
  const term = input.term_months && input.term_months > 0 ? Math.round(input.term_months) : null;
  const plan = term ? (input.loan_plan ?? 'monthly_interest') : null;
  return {
    interest_rate: input.interest_rate || null,
    rate_unit: input.rate_unit ?? 'year',
    lender_type: input.lender_type ?? null,
    loan_plan: plan,
    term_months: term,
    pay_day: plan && plan !== 'lump_sum' ? Math.min(31, Math.max(1, Math.round(input.pay_day ?? Number(date.slice(8, 10))))) : null,
    ...(term ? { due_on: addMonths(date, term) } : {}),
  };
}
