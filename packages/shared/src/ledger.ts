/**
 * Sổ thu chi: dữ liệu nằm trong bộ nhớ, ghi xuống máy (IndexedDB trên web, SQLite trên mobile)
 * qua LedgerStorage. Web và mobile dùng chung class này; mỗi nơi chỉ viết phần lưu trữ.
 */
import { addMonths, cutKg, cutOwing, cutPaid, cutValue, formatQty, formatQtyGrouped, supplyCost, supplyEntryNote } from './advanced';
import { randomUuid, type Deal } from './api';
import { formatVnd } from './money';
import {
  DEFAULT_CATEGORIES,
  type Debt,
  type DebtKind,
  type DebtPayment,
  type EntryType,
  type CutLine,
  type FarmLog,
  type FarmLogKind,
  type CustomFieldDef,
  type CustomFieldTarget,
  type CustomFieldType,
  type Garden,
  type Harvest,
  type HarvestContract,
  type HarvestCut,
  type LedgerCategory,
  type LenderType,
  type LoanPlan,
  type QuickTemplate,
  type Season,
  type StorageMode,
  type Supply,
  type SupplyUsage,
  type SyncRecord,
  type Transaction,
  type Worker,
  type WorkLog,
} from './types';

/**
 * Bảng của sổ; các bảng sau `transactions` dùng cho chế độ Nâng cao
 * (mùa vụ, kho vật tư, công nợ, bán cho lái, khoản hay dùng, thu hoạch, nhân công, ô tự thêm).
 * Tên bảng phải có trong LedgerRecord::TABLES ở backend thì mới đồng bộ được.
 */
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
  'templates',
  'harvests',
  'workers',
  'work_logs',
  'custom_fields',
  'farm_logs',
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
  templates: QuickTemplate[];
  harvests: Harvest[];
  workers: Worker[];
  work_logs: WorkLog[];
  custom_fields: CustomFieldDef[];
  farm_logs: FarmLog[];
}

/** Cài đặt của sổ, lưu cùng chỗ với dữ liệu */
export interface LedgerMeta {
  storage_mode?: StorageMode;
  last_garden_id?: string;
  /** Tài khoản khi bật "lưu cả trên mạng" */
  account?: { token: string; name: string; phone: string | null };
  /** Tài khoản gần nhất sổ này đã gửi lên (giữ lại cả khi tắt lưu trên mạng), để hỏi lại khi đăng nhập tài khoản khác */
  linked_phone?: string | null;
  /** Đã nhận từ server tới version này */
  sync_version?: number;
  /** Mọi thay đổi trên máy có updated_at trước mốc này đã gửi lên server */
  last_pushed_at?: string;
  /** Lần đồng bộ thành công gần nhất (giờ máy) */
  last_synced_at?: string;
  /** Bật chế độ Nâng cao: mùa vụ, kho vật tư, công nợ */
  advanced?: boolean;
  /** Đơn mua bán chung đã nối vào sổ: uuid đơn => ghi vào vườn / hạng mục nào */
  deal_links?: Record<string, DealLink>;
}

/** Cách ghi 1 đơn mua bán chung vào sổ của mình */
export interface DealLink {
  garden_id: string | null;
  /** Hạng mục cho các đợt cân (tiền vào nếu mình bán, tiền ra nếu mình mua) */
  category_id: string;
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
  /** Ảnh hóa đơn đã lưu trên máy (xem receipts.ts) */
  photo_id?: string | null;
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
  /** Tiền lái trả đợt này (ngoài trừ cọc); bỏ trống = trả đủ */
  paid?: number | null;
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

export interface NewTemplate {
  label?: string | null;
  type: EntryType;
  amount: number;
  category_id: string;
  garden_id: string | null;
  note?: string | null;
}

export interface NewHarvest {
  garden_id: string;
  date?: string;
  crop?: string | null;
  quantity: number;
  unit?: string;
  /** Có giá (đồng / đơn vị) = đã bán: tự ghi khoản tiền vào */
  price?: number | null;
  category_id?: string;
  note?: string | null;
}

export interface NewFarmLog {
  garden_id: string;
  date?: string;
  kind: FarmLogKind;
  title: string;
  quantity?: number | null;
  unit?: string | null;
  target?: string | null;
  withholding_days?: number | null;
  /** Lấy từ kho vật tư: tự ghi "dùng cho vườn" với số lượng này (tiền chuyển sang vườn) */
  supply_id?: string | null;
  worker?: string | null;
  note?: string | null;
}

export interface NewWorker {
  name: string;
  phone?: string | null;
  wage: number;
  note?: string | null;
}

/** Chấm công 1 ngày cho nhiều người cùng lúc */
export interface NewWorkDay {
  date?: string;
  garden_id: string | null;
  workers: Array<{ worker_id: string; days: number }>;
  note?: string | null;
}

export interface NewCustomField {
  target: CustomFieldTarget;
  label: string;
  type: CustomFieldType;
  options?: string[] | null;
}

/** Bảng có ô tự thêm, theo loại đối tượng */
export const CUSTOM_FIELD_TABLES = { garden: 'gardens', transaction: 'transactions', supply: 'supplies' } as const;

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
    templates: new Map(),
    harvests: new Map(),
    workers: new Map(),
    work_logs: new Map(),
    custom_fields: new Map(),
    farm_logs: new Map(),
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
      templates: alive(this.tables.templates).sort((a, b) => a.label.localeCompare(b.label, 'vi')),
      harvests: alive(this.tables.harvests).sort((a, b) => b.date.localeCompare(a.date) || b.updated_at.localeCompare(a.updated_at)),
      workers: alive(this.tables.workers).sort((a, b) => a.name.localeCompare(b.name, 'vi')),
      work_logs: alive(this.tables.work_logs).sort((a, b) => b.date.localeCompare(a.date) || b.updated_at.localeCompare(a.updated_at)),
      custom_fields: alive(this.tables.custom_fields).sort((a, b) => a.sort - b.sort),
      farm_logs: alive(this.tables.farm_logs).sort((a, b) => b.date.localeCompare(a.date) || b.updated_at.localeCompare(a.updated_at)),
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
   * Mùa vụ, sản lượng thu hoạch của vườn bị xóa; vật tư đã dùng cho vườn được trả về kho;
   * ngày công của vườn chuyển sang "chi chung". Trả về hàm hoàn tác.
   */
  async removeGarden(id: string): Promise<Undo> {
    const garden = this.tables.gardens.get(id);
    if (!garden) return async () => {};
    if (this.live('harvest_contracts').some((c) => c.garden_id === id)) throw new Error('Vườn này còn hợp đồng bán cho lái. Hãy xóa hợp đồng trước.');
    const at = this.stamp();
    const moved = this.live('transactions').filter((t) => t.garden_id === id);
    const movedDebts = this.live('debts').filter((d) => d.garden_id === id);
    const movedLogs = this.live('work_logs').filter((l) => l.garden_id === id);
    await this.write('gardens', [{ ...garden, deleted_at: at, updated_at: at }]);
    if (movedLogs.length) await this.write('work_logs', movedLogs.map((l) => ({ ...l, garden_id: null, updated_at: at })));
    if (moved.length) await this.write('transactions', moved.map((t) => ({ ...t, garden_id: null, updated_at: at })));
    if (movedDebts.length) await this.write('debts', movedDebts.map((d) => ({ ...d, garden_id: null, updated_at: at })));
    const undoChildren = await this.removeRecords([
      ...this.live('seasons').filter((s) => s.garden_id === id).map((r) => ['seasons', r] as const),
      ...this.live('supply_usages').filter((u) => u.garden_id === id).map((r) => ['supply_usages', r] as const),
      ...this.live('harvests').filter((h) => h.garden_id === id).map((r) => ['harvests', r] as const),
      ...this.live('farm_logs').filter((l) => l.garden_id === id).map((r) => ['farm_logs', r] as const),
    ]);
    return async () => {
      const back = this.stamp();
      await this.write('gardens', [{ ...garden, deleted_at: null, updated_at: back }]);
      if (moved.length) await this.write('transactions', moved.map((t) => ({ ...t, garden_id: id, updated_at: back })));
      if (movedDebts.length) await this.write('debts', movedDebts.map((d) => ({ ...d, garden_id: id, updated_at: back })));
      if (movedLogs.length) await this.write('work_logs', movedLogs.map((l) => ({ ...l, garden_id: id, updated_at: back })));
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
      // Chỉ thêm trường khi có ảnh: khoản cũ / không ảnh giữ nguyên dạng bản ghi
      ...(input.photo_id ? { photo_id: input.photo_id } : {}),
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

  /** Khoản tự ghi từ đơn mua bán chung (sửa / xóa ở đơn, không sửa ở sổ) */
  dealOf(entry: Transaction): string | null {
    const deal = entry.extra?.deal;
    return typeof deal === 'string' ? deal : null;
  }

  /** Tìm hoặc tạo hạng mục theo tên (vd "Mua nông sản" cho thương lái) */
  async ensureCategory(type: EntryType, name: string, icon: string, color = '#64748b'): Promise<string> {
    const found = this.snapshot.categories.find((c) => c.type === type && c.name === name);
    if (found) return found.id;
    const category: LedgerCategory = { id: randomUuid(), type, name, icon, color, sort: this.snapshot.categories.length, updated_at: this.stamp(), deleted_at: null };
    await this.write('categories', [category]);
    return category.id;
  }

  /** Nối / bỏ nối đơn mua bán chung với sổ. Bỏ nối thì gỡ các khoản đã tự ghi. */
  async linkDeal(dealUuid: string, link: DealLink | null): Promise<void> {
    const links = { ...(this.meta.deal_links ?? {}) };
    if (link) links[dealUuid] = link;
    else delete links[dealUuid];
    await this.setMeta({ deal_links: links });
    if (!link) await this.applyDeal({ uuid: dealUuid, entries: [] } as unknown as Deal);
  }

  /**
   * Ghi các mục của đơn mua bán chung vào sổ (đơn phải có entries, tức lấy từ API chi tiết):
   * - đợt cân đã xác nhận: tiền vào nếu mình là bên bán, tiền ra nếu mình là bên mua (tiền hàng của đợt)
   * - chi phí riêng của mình: tiền ra
   * Cọc / lần trả tiền không ghi (không phải lời/lỗ). Đợt cân bị sửa (chưa xác nhận lại) hoặc xóa thì gỡ khoản tương ứng.
   * Mã khoản = mã mục của đơn, nên chạy lại nhiều lần / trên nhiều máy không bị trùng.
   * Trả về số khoản đã thay đổi.
   */
  async applyDeal(deal: Deal): Promise<number> {
    const link = this.meta.deal_links?.[deal.uuid];
    const at = this.stamp();
    const wanted = new Map<string, Transaction>();
    if (link && deal.entries) {
      for (const e of deal.entries) {
        const isCut = e.kind === 'cut' && e.status === 'confirmed';
        const isCost = e.kind === 'cost' && e.mine;
        if (!isCut && !isCost) continue;
        const type: EntryType = isCut && deal.my_role === 'seller' ? 'income' : 'expense';
        wanted.set(e.uuid, {
          id: e.uuid,
          type,
          amount: e.amount,
          date: e.date,
          garden_id: link.garden_id,
          season_id: null,
          category_id: isCut ? link.category_id : this.categoryByName('expense', 'Khác'),
          supply_id: null,
          note: isCut ? `Đơn "${deal.title}": ${formatQty(e.kg)} ${deal.unit}` : `Chi phí đơn "${deal.title}"${e.note ? `: ${e.note}` : ''}`,
          extra: { deal: deal.uuid },
          updated_at: at,
          deleted_at: null,
        });
      }
    }

    const changed: Transaction[] = [];
    const same = (a: Transaction, b: Transaction) =>
      a.deleted_at === null && a.type === b.type && a.amount === b.amount && a.date === b.date && a.garden_id === b.garden_id && a.category_id === b.category_id && a.note === b.note;
    for (const [id, tx] of wanted) {
      const current = this.tables.transactions.get(id);
      if (!current || !same(current, tx)) changed.push(tx);
    }
    for (const current of this.tables.transactions.values()) {
      if (current.deleted_at === null && current.extra?.deal === deal.uuid && !wanted.has(current.id)) changed.push({ ...current, deleted_at: at, updated_at: at });
    }
    if (changed.length) await this.write('transactions', changed);
    return changed.length;
  }

  /**
   * Xóa một khoản; trả về hàm hoàn tác (nút "Hoàn tác" hiện vài giây).
   * Khoản sinh ra khi mua vật tư / ghi nợ thì xóa luôn vật tư / khoản nợ đó, để số liệu không lệch.
   */
  async removeEntry(id: string): Promise<Undo> {
    const entry = this.tables.transactions.get(id);
    if (!entry) return async () => {};
    if (this.dealOf(entry)) throw new Error('Khoản này tự ghi từ đơn mua bán chung. Hãy sửa / xóa ở đơn, hoặc bỏ nối đơn với sổ.');
    if (entry.supply_id && this.alive('supplies', entry.supply_id)) return this.removeSupply(entry.supply_id);
    const debt = this.live('debts').find((d) => d.transaction_id === id);
    if (debt) return this.removeDebt(debt.id);
    const cut = this.live('harvest_cuts').find((c) => c.transaction_id === id);
    if (cut) return this.removeCut(cut.id);
    const payment = this.live('debt_payments').find((p) => p.interest_transaction_id === id);
    if (payment) return this.removePayment(payment.id);
    const settled = this.live('harvest_contracts').find((c) => c.settle_transaction_id === id);
    if (settled) return this.reopenContract(settled.id);
    const harvest = this.live('harvests').find((h) => h.transaction_id === id);
    if (harvest) return this.removeHarvest(harvest.id);
    if (this.live('work_logs').some((l) => l.transaction_id === id)) return this.unpayWork(id);
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
      paid: this.cleanCutPaid(input.paid, value - deduct),
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
    const paid = patch.paid === undefined ? (cut.paid ?? null) : patch.paid;
    const next: HarvestCut = {
      ...cut,
      ...patch,
      lines,
      deposit_deduct: deduct,
      paid: this.cleanCutPaid(paid, cutValue(lines) - deduct),
      note: patch.note === undefined ? cut.note : patch.note?.trim() || null,
      updated_at: at,
    };
    await this.write('harvest_cuts', [next]);
    const entry = cut.transaction_id ? this.alive('transactions', cut.transaction_id) : undefined;
    if (entry) await this.write('transactions', [{ ...entry, amount: cutValue(lines), date: next.date, note: this.cutNote(contract, next), updated_at: at }]);
  }

  /**
   * Lái trả thêm tiền hàng còn nợ: chia vào các đợt còn nợ, đợt cũ trước. Trả về số tiền đã ghi
   * (không vượt tổng còn nợ).
   */
  async payContractOwing(contractId: string, amount: number): Promise<number> {
    const cuts = this.live('harvest_cuts')
      .filter((c) => c.contract_id === contractId)
      .sort((a, b) => a.date.localeCompare(b.date) || a.updated_at.localeCompare(b.updated_at));
    let left = Math.round(amount);
    const at = this.stamp();
    const changed: HarvestCut[] = [];
    for (const cut of cuts) {
      const owing = cutOwing(cut);
      if (left <= 0 || owing <= 0) continue;
      const pay = Math.min(owing, left);
      changed.push({ ...cut, paid: this.cleanCutPaid(cutPaid(cut) + pay, cutValue(cut.lines) - cut.deposit_deduct), updated_at: at });
      left -= pay;
    }
    if (changed.length) await this.write('harvest_cuts', changed);
    return Math.round(amount) - left;
  }

  /** Lái trả đợt này: không âm, không vượt số phải trả; trả đủ thì lưu null (giống đợt ghi trước khi có trường này) */
  private cleanCutPaid(paid: number | null | undefined, due: number): number | null {
    if (paid === undefined || paid === null) return null;
    const value = Math.max(0, Math.min(Math.round(paid), Math.max(0, due)));
    return value >= due ? null : value;
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

  /**
   * Hoàn tất hợp đồng (quyết toán). Cọc còn dư thì xử lý theo `how`:
   * - deduct: trừ nốt vào tiền hàng các đợt (đợt cuối trước), rồi đóng
   * - refund: trả lại phần cọc dư cho lái
   * - forfeit: lái bỏ phần cọc dư (thành tiền vào)
   * Cọc đã trừ hết thì `how` không cần.
   */
  async settleContract(contractId: string, how: 'deduct' | 'refund' | 'forfeit' = 'deduct', date?: string): Promise<void> {
    const contract = this.openContract(contractId);
    let left = contract.deposit - this.deductedFor(contractId);
    if (left <= 0) return this.closeContract(contractId, date);
    if (how === 'refund') return this.refundDeposit(contractId, left, date);
    if (how === 'forfeit') return this.forfeitDeposit(contractId, date);
    const cuts = this.live('harvest_cuts')
      .filter((c) => c.contract_id === contractId)
      .sort((a, b) => b.date.localeCompare(a.date) || b.updated_at.localeCompare(a.updated_at));
    const room = cuts.reduce((s, c) => s + cutValue(c.lines) - c.deposit_deduct, 0);
    if (room < left) throw new Error(`Tiền hàng các đợt chỉ còn ${formatVnd(room)} để trừ cọc, thiếu ${formatVnd(left - room)}. Hãy trả lại phần dư cho lái hoặc ghi lái bỏ cọc.`);
    const at = this.stamp();
    const changed: HarvestCut[] = [];
    for (const cut of cuts) {
      if (left <= 0) break;
      const add = Math.min(left, cutValue(cut.lines) - cut.deposit_deduct);
      if (add <= 0) continue;
      changed.push({ ...cut, deposit_deduct: cut.deposit_deduct + add, updated_at: at });
      left -= add;
    }
    await this.write('harvest_cuts', changed);
    await this.closeContract(contractId, date);
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

  // ---- Khoản hay dùng (mẫu ghi nhanh) ----

  async addTemplate(input: NewTemplate): Promise<QuickTemplate> {
    if (!(input.amount > 0)) throw new Error('Số tiền phải lớn hơn 0.');
    const category = this.alive('categories', input.category_id);
    const note = input.note?.trim() || null;
    const template: QuickTemplate = {
      id: randomUuid(),
      label: input.label?.trim() || [category?.name, note].filter(Boolean).join(' – ') || 'Khoản hay dùng',
      type: input.type,
      amount: Math.round(input.amount),
      category_id: input.category_id,
      garden_id: input.garden_id,
      note,
      updated_at: this.stamp(),
      deleted_at: null,
    };
    await this.write('templates', [template]);
    return template;
  }

  /** Lưu 1 khoản đã ghi làm khoản hay dùng */
  async templateFromEntry(entryId: string, label?: string): Promise<QuickTemplate> {
    const entry = this.alive('transactions', entryId);
    if (!entry) throw new Error('Không tìm thấy khoản này.');
    return this.addTemplate({ label, type: entry.type, amount: entry.amount, category_id: entry.category_id, garden_id: entry.garden_id, note: entry.note });
  }

  async updateTemplate(id: string, patch: Partial<NewTemplate>): Promise<void> {
    const template = this.alive('templates', id);
    if (!template) return;
    const next = { ...template, ...patch, label: (patch.label ?? template.label).trim() || template.label };
    if (patch.amount !== undefined) next.amount = Math.round(patch.amount);
    if (patch.note !== undefined) next.note = patch.note?.trim() || null;
    await this.write('templates', [{ ...next, updated_at: this.stamp() } as QuickTemplate]);
  }

  async removeTemplate(id: string): Promise<Undo> {
    const template = this.alive('templates', id);
    return template ? this.removeRecords([['templates', template]]) : async () => {};
  }

  /** Ghi 1 khoản theo mẫu (đổi được số tiền / ngày lúc ghi). Vườn của mẫu đã xóa thì ghi chi chung. */
  async useTemplate(id: string, override: { amount?: number; date?: string; garden_id?: string | null } = {}): Promise<Transaction> {
    const template = this.alive('templates', id);
    if (!template) throw new Error('Không tìm thấy khoản hay dùng này.');
    const gardenId = override.garden_id !== undefined ? override.garden_id : template.garden_id && this.alive('gardens', template.garden_id) ? template.garden_id : null;
    return this.addEntry({
      type: template.type,
      amount: override.amount ?? template.amount,
      category_id: this.alive('categories', template.category_id) ? template.category_id : this.categoryByName(template.type, template.type === 'income' ? 'Thu khác' : 'Khác'),
      garden_id: gardenId,
      date: override.date,
      note: template.note,
    });
  }

  // ---- Sản lượng thu hoạch ----

  async addHarvest(input: NewHarvest): Promise<Harvest> {
    this.checkHarvest(input);
    const harvest: Harvest = {
      id: randomUuid(),
      garden_id: input.garden_id,
      date: input.date ?? today(this.now()),
      crop: input.crop?.trim() || this.alive('gardens', input.garden_id)?.crop || null,
      quantity: input.quantity,
      unit: input.unit?.trim() || 'kg',
      price: input.price && input.price > 0 ? input.price : null,
      transaction_id: null,
      note: input.note?.trim() || null,
      updated_at: this.stamp(),
      deleted_at: null,
    };
    harvest.transaction_id = await this.syncHarvestEntry(harvest, input.category_id);
    await this.write('harvests', [harvest]);
    return harvest;
  }

  async updateHarvest(id: string, patch: Partial<NewHarvest>): Promise<void> {
    const harvest = this.alive('harvests', id);
    if (!harvest) return;
    const next: Harvest = {
      ...harvest,
      garden_id: patch.garden_id ?? harvest.garden_id,
      date: patch.date ?? harvest.date,
      crop: patch.crop === undefined ? harvest.crop : patch.crop?.trim() || null,
      quantity: patch.quantity ?? harvest.quantity,
      unit: patch.unit?.trim() || harvest.unit,
      price: patch.price === undefined ? harvest.price : patch.price && patch.price > 0 ? patch.price : null,
      note: patch.note === undefined ? harvest.note : patch.note?.trim() || null,
      updated_at: this.stamp(),
    };
    this.checkHarvest(next);
    next.transaction_id = await this.syncHarvestEntry(next, patch.category_id);
    await this.write('harvests', [next]);
  }

  // ---- Nhật ký canh tác ----

  /** Ghi 1 việc vào nhật ký vườn; chọn vật tư trong kho kèm số lượng thì tự ghi "dùng cho vườn" */
  async addFarmLog(input: NewFarmLog): Promise<FarmLog> {
    const log = this.farmLogFrom(input, randomUuid());
    if (input.supply_id && log.quantity) {
      const usage = await this.useSupply({ supply_id: input.supply_id, garden_id: log.garden_id, quantity: log.quantity, used_on: log.date, note: `Nhật ký: ${log.title}` });
      log.supply_usage_id = usage.id;
    }
    await this.write('farm_logs', [log]);
    await this.setMeta({ last_garden_id: log.garden_id });
    return log;
  }

  /** Sửa nhật ký; lần dùng vật tư đi kèm (nếu có) được cập nhật theo vườn / ngày / số lượng mới */
  async updateFarmLog(id: string, patch: Partial<NewFarmLog>): Promise<void> {
    const log = this.alive('farm_logs', id);
    if (!log) return;
    const next: FarmLog = { ...this.farmLogFrom({ ...log, ...patch, supply_id: log.supply_id }, log.id), supply_usage_id: log.supply_usage_id };
    const usage = log.supply_usage_id ? this.alive('supply_usages', log.supply_usage_id) : undefined;
    if (usage) {
      const supply = this.alive('supplies', usage.supply_id);
      const quantity = next.quantity ?? usage.quantity;
      const left = supply ? supply.quantity - this.usedQuantity(supply.id) + usage.quantity : quantity;
      if (quantity > left + 1e-9) throw new Error(`Trong kho chỉ còn ${formatQty(left)} ${supply?.unit ?? ''}.`.trim());
      await this.write('supply_usages', [{ ...usage, garden_id: next.garden_id, used_on: next.date, quantity, updated_at: this.stamp() }]);
    }
    await this.write('farm_logs', [next]);
  }

  /** Xóa nhật ký (kèm lần dùng vật tư đi kèm: vật tư trả về kho); trả về hàm hoàn tác */
  async removeFarmLog(id: string): Promise<Undo> {
    const log = this.alive('farm_logs', id);
    if (!log) return async () => {};
    const usage = log.supply_usage_id ? this.alive('supply_usages', log.supply_usage_id) : undefined;
    return this.removeRecords([['farm_logs', log], ...(usage ? [['supply_usages', usage] as const] : [])]);
  }

  private farmLogFrom(input: NewFarmLog, id: string): FarmLog {
    if (!this.alive('gardens', input.garden_id)) throw new Error('Hãy chọn vườn.');
    const supply = input.supply_id ? this.alive('supplies', input.supply_id) : undefined;
    const title = input.title.trim() || supply?.name || '';
    if (!title) throw new Error('Hãy ghi tên thuốc / phân / việc làm.');
    const quantity = input.quantity && input.quantity > 0 ? input.quantity : null;
    const days = input.withholding_days && input.withholding_days > 0 ? Math.round(input.withholding_days) : null;
    return {
      id,
      garden_id: input.garden_id,
      date: input.date ?? today(this.now()),
      kind: input.kind,
      title,
      quantity,
      unit: input.unit?.trim() || supply?.unit || null,
      target: input.target?.trim() || null,
      withholding_days: input.kind === 'spray' ? days : null,
      supply_id: supply?.id ?? null,
      supply_usage_id: null,
      worker: input.worker?.trim() || null,
      note: input.note?.trim() || null,
      updated_at: this.stamp(),
      deleted_at: null,
    };
  }

  /** Xóa sản lượng kèm khoản tiền bán (nếu có); trả về hàm hoàn tác */
  async removeHarvest(id: string): Promise<Undo> {
    const harvest = this.alive('harvests', id);
    if (!harvest) return async () => {};
    const entry = harvest.transaction_id ? this.alive('transactions', harvest.transaction_id) : undefined;
    return this.removeRecords([['harvests', harvest], ...(entry ? [['transactions', entry] as const] : [])]);
  }

  private checkHarvest(input: Pick<NewHarvest, 'garden_id' | 'quantity'>) {
    if (!this.alive('gardens', input.garden_id)) throw new Error('Hãy chọn vườn.');
    if (!(input.quantity > 0)) throw new Error('Số lượng phải lớn hơn 0.');
  }

  /** Có giá bán: tạo / cập nhật khoản tiền vào; bỏ giá: xóa khoản đó. Trả về id khoản (hoặc null). */
  private async syncHarvestEntry(harvest: Harvest, categoryId?: string): Promise<string | null> {
    const current = harvest.transaction_id ? this.alive('transactions', harvest.transaction_id) : undefined;
    if (!harvest.price) {
      if (current) await this.removeRecords([['transactions', current]]);
      return null;
    }
    const entry: Transaction = {
      id: current?.id ?? randomUuid(),
      type: 'income',
      amount: Math.round(harvest.quantity * harvest.price),
      date: harvest.date,
      garden_id: harvest.garden_id,
      season_id: null,
      category_id: categoryId ?? current?.category_id ?? this.incomeCategory('Bán nông sản'),
      supply_id: null,
      note: `Bán ${formatQtyGrouped(harvest.quantity)} ${harvest.unit}${harvest.crop ? ` ${harvest.crop.toLowerCase()}` : ''} × ${formatVnd(harvest.price)}`,
      extra: current?.extra,
      updated_at: this.stamp(),
      deleted_at: null,
    };
    await this.write('transactions', [entry]);
    return entry.id;
  }

  // ---- Nhân công: người làm, chấm công, trả công ----

  async addWorker(input: NewWorker): Promise<Worker> {
    if (!input.name.trim()) throw new Error('Cần nhập tên người làm.');
    const worker: Worker = {
      id: randomUuid(),
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      wage: Math.max(0, Math.round(input.wage)),
      note: input.note?.trim() || null,
      updated_at: this.stamp(),
      deleted_at: null,
    };
    await this.write('workers', [worker]);
    return worker;
  }

  /** Đổi tiền công chỉ áp dụng cho ngày công chấm sau đó */
  async updateWorker(id: string, patch: Partial<NewWorker>): Promise<void> {
    const worker = this.alive('workers', id);
    if (!worker) return;
    const next: Worker = {
      ...worker,
      name: patch.name?.trim() || worker.name,
      phone: patch.phone === undefined ? worker.phone : patch.phone?.trim() || null,
      wage: patch.wage === undefined ? worker.wage : Math.max(0, Math.round(patch.wage)),
      note: patch.note === undefined ? worker.note : patch.note?.trim() || null,
      updated_at: this.stamp(),
    };
    await this.write('workers', [next]);
  }

  /** Xóa người làm: phải trả hết công trước (để không mất số nợ công) */
  async removeWorker(id: string): Promise<Undo> {
    const worker = this.alive('workers', id);
    if (!worker) return async () => {};
    if (this.live('work_logs').some((l) => l.worker_id === id && !l.paid_on)) throw new Error(`${worker.name} còn công chưa trả. Hãy trả công hoặc xóa ngày công trước.`);
    return this.removeRecords([['workers', worker]]);
  }

  /** Chấm công 1 ngày cho nhiều người; trả về các ngày công đã ghi */
  async addWorkDay(input: NewWorkDay): Promise<WorkLog[]> {
    const date = input.date ?? today(this.now());
    if (input.garden_id && !this.alive('gardens', input.garden_id)) throw new Error('Vườn này không còn.');
    const logs: WorkLog[] = [];
    for (const { worker_id, days } of input.workers) {
      const worker = this.alive('workers', worker_id);
      if (!worker || !(days > 0)) continue;
      logs.push({
        id: randomUuid(),
        worker_id,
        garden_id: input.garden_id,
        date,
        days,
        wage: worker.wage,
        paid_on: null,
        transaction_id: null,
        note: input.note?.trim() || null,
        updated_at: this.stamp(),
        deleted_at: null,
      });
    }
    if (logs.length === 0) throw new Error('Hãy chọn ít nhất 1 người làm.');
    await this.write('work_logs', logs);
    if (input.garden_id) await this.setMeta({ last_garden_id: input.garden_id });
    return logs;
  }

  async updateWorkLog(id: string, patch: Partial<Pick<WorkLog, 'garden_id' | 'date' | 'days' | 'wage' | 'note'>>): Promise<void> {
    const log = this.alive('work_logs', id);
    if (!log) return;
    if (log.paid_on) throw new Error('Ngày công này đã trả tiền. Hãy bỏ lần trả công trước rồi mới sửa.');
    if (patch.days !== undefined && !(patch.days > 0)) throw new Error('Số ngày công phải lớn hơn 0.');
    await this.write('work_logs', [{ ...log, ...patch, note: patch.note === undefined ? log.note : patch.note?.trim() || null, updated_at: this.stamp() }]);
  }

  async removeWorkLog(id: string): Promise<Undo> {
    const log = this.alive('work_logs', id);
    if (!log) return async () => {};
    if (log.paid_on) throw new Error('Ngày công này đã trả tiền. Hãy bỏ lần trả công trước rồi mới xóa.');
    return this.removeRecords([['work_logs', log]]);
  }

  /**
   * Trả công cho 1 người: các ngày công chưa trả (hoặc logIds) được đánh dấu đã trả,
   * và ghi khoản tiền ra "Nhân công" — mỗi vườn 1 khoản, để tiền công tính đúng vào vườn đã làm.
   * Trả về hàm hoàn tác.
   */
  async payWorker(workerId: string, options: { date?: string; logIds?: string[] } = {}): Promise<Undo> {
    const worker = this.alive('workers', workerId);
    if (!worker) throw new Error('Không tìm thấy người làm.');
    const logs = this.live('work_logs').filter((l) => l.worker_id === workerId && !l.paid_on && (!options.logIds || options.logIds.includes(l.id)));
    if (logs.length === 0) throw new Error(`${worker.name} không còn công chưa trả.`);
    const date = options.date ?? today(this.now());
    const byGarden = new Map<string | null, WorkLog[]>();
    for (const l of logs) byGarden.set(l.garden_id, [...(byGarden.get(l.garden_id) ?? []), l]);

    const entries: Transaction[] = [];
    const paid: WorkLog[] = [];
    for (const [gardenId, group] of byGarden) {
      const days = group.reduce((sum, l) => sum + l.days, 0);
      const entry: Transaction = {
        id: randomUuid(),
        type: 'expense',
        amount: Math.round(group.reduce((sum, l) => sum + l.days * l.wage, 0)),
        date,
        garden_id: gardenId,
        season_id: null,
        category_id: this.categoryByName('expense', 'Nhân công'),
        supply_id: null,
        note: `Trả công ${worker.name}: ${formatQtyGrouped(days)} ngày`,
        updated_at: this.stamp(),
        deleted_at: null,
      };
      entries.push(entry);
      for (const l of group) paid.push({ ...l, paid_on: date, transaction_id: entry.id, updated_at: entry.updated_at });
    }
    await this.write('transactions', entries);
    await this.write('work_logs', paid);
    return async () => {
      for (const entry of entries) await this.unpayWork(entry.id);
    };
  }

  /** Bỏ 1 lần trả công (xóa khoản tiền ra, các ngày công thành "chưa trả" lại); trả về hàm hoàn tác */
  async unpayWork(transactionId: string): Promise<Undo> {
    const entry = this.alive('transactions', transactionId);
    const logs = this.live('work_logs').filter((l) => l.transaction_id === transactionId);
    const at = this.stamp();
    if (entry) await this.write('transactions', [{ ...entry, deleted_at: at, updated_at: at }]);
    if (logs.length) await this.write('work_logs', logs.map((l) => ({ ...l, paid_on: null, transaction_id: null, updated_at: at })));
    return async () => {
      const back = this.stamp();
      if (entry) await this.write('transactions', [{ ...entry, deleted_at: null, updated_at: back }]);
      if (logs.length) await this.write('work_logs', logs.map((l) => ({ ...l, updated_at: back })));
    };
  }

  // ---- Ô thông tin tự thêm ----

  async addCustomField(input: NewCustomField): Promise<CustomFieldDef> {
    const label = input.label.trim();
    if (!label) throw new Error('Cần đặt tên ô thông tin.');
    if (this.live('custom_fields').some((f) => f.target === input.target && f.label.toLowerCase() === label.toLowerCase())) throw new Error(`Đã có ô "${label}".`);
    const options = input.type === 'select' ? cleanOptions(input.options) : null;
    if (input.type === 'select' && (!options || options.length < 2)) throw new Error('Ô lựa chọn cần ít nhất 2 lựa chọn.');
    const field: CustomFieldDef = {
      id: randomUuid(),
      target: input.target,
      // key không đổi khi đổi tên ô, nên giá trị đã nhập vẫn giữ
      key: `f_${randomUuid().slice(0, 8)}`,
      label,
      type: input.type,
      options,
      sort: this.live('custom_fields').filter((f) => f.target === input.target).length,
      updated_at: this.stamp(),
      deleted_at: null,
    };
    await this.write('custom_fields', [field]);
    return field;
  }

  /** Đổi tên / lựa chọn; không đổi loại ô (giá trị cũ có thể không hợp) */
  async updateCustomField(id: string, patch: { label?: string; options?: string[] | null }): Promise<void> {
    const field = this.alive('custom_fields', id);
    if (!field) return;
    const options = field.type === 'select' && patch.options !== undefined ? cleanOptions(patch.options) : field.options;
    if (field.type === 'select' && (!options || options.length < 2)) throw new Error('Ô lựa chọn cần ít nhất 2 lựa chọn.');
    await this.write('custom_fields', [{ ...field, label: patch.label?.trim() || field.label, options, updated_at: this.stamp() }]);
  }

  /** Xóa ô: giá trị đã nhập vẫn nằm trong dữ liệu (hoàn tác là hiện lại) */
  async removeCustomField(id: string): Promise<Undo> {
    const field = this.alive('custom_fields', id);
    return field ? this.removeRecords([['custom_fields', field]]) : async () => {};
  }

  /** Ghi giá trị ô tự thêm cho 1 vườn / khoản / vật tư; giá trị rỗng thì xóa khỏi extra */
  async setExtra(target: CustomFieldTarget, id: string, values: Record<string, string | number | null>): Promise<void> {
    const table = CUSTOM_FIELD_TABLES[target];
    const record = this.alive(table, id);
    if (!record) return;
    const extra: Record<string, string | number | null> = { ...(record.extra ?? {}) };
    for (const [key, value] of Object.entries(values)) {
      if (value === null || value === '') delete extra[key];
      else extra[key] = value;
    }
    await this.write(table, [{ ...record, extra, updated_at: this.stamp() } as never]);
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
  const payDay = plan && plan !== 'lump_sum' ? Math.min(31, Math.max(1, Math.round(input.pay_day ?? Number(date.slice(8, 10))))) : null;
  return {
    interest_rate: input.interest_rate || null,
    rate_unit: input.rate_unit ?? 'year',
    lender_type: input.lender_type ?? null,
    loan_plan: plan,
    term_months: term,
    pay_day: payDay,
    // Hạn trả hết nợ = ngày của kỳ cuối (theo ngày trả hằng tháng nếu có)
    ...(term ? { due_on: addMonths(date, term, payDay ?? undefined) } : {}),
  };
}

function cleanOptions(options: string[] | null | undefined): string[] | null {
  const list = [...new Set((options ?? []).map((o) => o.trim()).filter(Boolean))];
  return list.length ? list : null;
}
