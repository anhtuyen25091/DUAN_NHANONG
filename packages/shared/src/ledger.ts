/**
 * Sổ thu chi: dữ liệu nằm trong bộ nhớ, ghi xuống máy (IndexedDB trên web, SQLite trên mobile)
 * qua LedgerStorage. Web và mobile dùng chung class này; mỗi nơi chỉ viết phần lưu trữ.
 */
import { randomUuid } from './api';
import {
  DEFAULT_CATEGORIES,
  type EntryType,
  type Garden,
  type LedgerCategory,
  type StorageMode,
  type SyncRecord,
  type Transaction,
} from './types';

export const LEDGER_TABLES = ['gardens', 'categories', 'transactions'] as const;
export type LedgerTable = (typeof LEDGER_TABLES)[number];

export interface LedgerRecords {
  gardens: Garden[];
  categories: LedgerCategory[];
  transactions: Transaction[];
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

/** Ảnh chụp dữ liệu (đã bỏ bản ghi bị xóa) cho giao diện; đổi object mỗi lần dữ liệu đổi */
export interface LedgerSnapshot {
  gardens: Garden[];
  categories: LedgerCategory[];
  transactions: Transaction[];
  meta: LedgerMeta;
}

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

  private async ensureDefaultCategories() {
    if (this.tables.categories.size > 0) return;
    const at = this.stamp();
    await this.write(
      'categories',
      DEFAULT_CATEGORIES.map((c, i) => ({ ...c, id: defaultCategoryId(i), sort: i, updated_at: at, deleted_at: null })),
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

  /** Xóa vườn; các khoản của vườn chuyển thành "chi chung" để không mất tiền. Trả về hàm hoàn tác. */
  async removeGarden(id: string): Promise<() => Promise<void>> {
    const garden = this.tables.gardens.get(id);
    if (!garden) return async () => {};
    const at = this.stamp();
    const moved = [...this.tables.transactions.values()].filter((t) => t.garden_id === id && t.deleted_at === null);
    await this.write('gardens', [{ ...garden, deleted_at: at, updated_at: at }]);
    if (moved.length) await this.write('transactions', moved.map((t) => ({ ...t, garden_id: null, updated_at: at })));
    return async () => {
      const back = this.stamp();
      await this.write('gardens', [{ ...garden, deleted_at: null, updated_at: back }]);
      if (moved.length) await this.write('transactions', moved.map((t) => ({ ...t, garden_id: id, updated_at: back })));
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

  /** Xóa một khoản; trả về hàm hoàn tác (nút "Hoàn tác" hiện vài giây) */
  async removeEntry(id: string): Promise<() => Promise<void>> {
    const entry = this.tables.transactions.get(id);
    if (!entry) return async () => {};
    const at = this.stamp();
    await this.write('transactions', [{ ...entry, deleted_at: at, updated_at: at }]);
    return async () => this.write('transactions', [{ ...entry, deleted_at: null, updated_at: this.stamp() }]);
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
    return {
      gardens: [...this.tables.gardens.values()],
      categories: [...this.tables.categories.values()],
      transactions: [...this.tables.transactions.values()],
    };
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
