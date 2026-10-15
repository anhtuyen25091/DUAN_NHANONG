import { describe, expect, it } from 'vitest';
import { groupByDate, Ledger, monthlyTotals, parseBackup, pressAmountKey, totals, type LedgerMeta, type LedgerStorage, type LedgerTable } from './ledger';
import type { SyncRecord } from './types';

/** Lưu trữ giả trong bộ nhớ, giống IndexedDB/SQLite */
function memoryStorage() {
  const tables: Record<string, Map<string, SyncRecord>> = {};
  let meta: LedgerMeta = {};
  const storage: LedgerStorage = {
    load: async () => ({
      records: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, [...v.values()]])),
      meta,
    }),
    save: async (table: LedgerTable, records: SyncRecord[]) => {
      tables[table] ??= new Map();
      for (const r of records) tables[table].set(r.id, structuredClone(r));
    },
    saveMeta: async (m) => {
      meta = { ...m };
    },
    clear: async () => {
      for (const k of Object.keys(tables)) delete tables[k];
      meta = {};
    },
  };
  return { storage, tables };
}

let clock = new Date('2026-10-14T08:00:00Z').getTime();
const now = () => new Date((clock += 1000));

describe('Ledger', () => {
  it('lần đầu mở tạo sẵn hạng mục mặc định, mở lại không tạo trùng', async () => {
    const { storage } = memoryStorage();
    const first = await Ledger.open(storage, now);
    expect(first.getSnapshot().categories.length).toBeGreaterThan(5);

    const again = await Ledger.open(storage, now);
    expect(again.getSnapshot().categories).toHaveLength(first.getSnapshot().categories.length);
  });

  it('ghi khoản chi: lưu xuống máy, nhớ vườn dùng gần nhất', async () => {
    const { storage, tables } = memoryStorage();
    const ledger = await Ledger.open(storage, now);
    const garden = await ledger.addGarden({ name: 'Vườn sau' });
    const phan = ledger.getSnapshot().categories.find((c) => c.name === 'Phân bón')!;

    await ledger.addEntry({ type: 'expense', amount: 350000, category_id: phan.id, garden_id: garden.id, date: '2026-10-14' });

    expect(tables.transactions.size).toBe(1);
    expect(ledger.getSnapshot().meta.last_garden_id).toBe(garden.id);
    const reopened = await Ledger.open(storage, now);
    expect(reopened.getSnapshot().transactions[0]).toMatchObject({ amount: 350000, garden_id: garden.id });
  });

  it('xóa rồi hoàn tác', async () => {
    const { storage } = memoryStorage();
    const ledger = await Ledger.open(storage, now);
    const cat = ledger.getSnapshot().categories[0];
    const entry = await ledger.addEntry({ type: 'expense', amount: 1000, category_id: cat.id, garden_id: null });

    const undo = await ledger.removeEntry(entry.id);
    expect(ledger.getSnapshot().transactions).toHaveLength(0);

    await undo();
    expect(ledger.getSnapshot().transactions).toHaveLength(1);
  });

  it('xóa vườn: các khoản chuyển sang chi chung, hoàn tác thì trả về vườn', async () => {
    const { storage } = memoryStorage();
    const ledger = await Ledger.open(storage, now);
    const garden = await ledger.addGarden({ name: 'Vườn A' });
    const cat = ledger.getSnapshot().categories[0];
    await ledger.addEntry({ type: 'expense', amount: 1000, category_id: cat.id, garden_id: garden.id });

    const undo = await ledger.removeGarden(garden.id);
    expect(ledger.getSnapshot().gardens).toHaveLength(0);
    expect(ledger.getSnapshot().transactions[0].garden_id).toBeNull();

    await undo();
    expect(ledger.getSnapshot().transactions[0].garden_id).toBe(garden.id);
  });

  it('sao lưu rồi nhập vào máy khác; nhập lại lần nữa không bị trùng', async () => {
    const a = await Ledger.open(memoryStorage().storage, now);
    await a.createSampleGarden();
    const text = JSON.stringify(a.exportBackup());

    const b = await Ledger.open(memoryStorage().storage, now);
    await b.importBackup(text);
    expect(b.getSnapshot().gardens.map((g) => g.name)).toEqual(['Vườn mẫu (bấm thử)']);
    expect(totals(b.getSnapshot().transactions)).toEqual(totals(a.getSnapshot().transactions));

    expect(await b.importBackup(text)).toBe(0);
  });

  it('gộp dữ liệu: bản updated_at mới hơn thắng', async () => {
    const ledger = await Ledger.open(memoryStorage().storage, now);
    const garden = await ledger.addGarden({ name: 'Cũ' });

    await ledger.merge({ gardens: [{ ...garden, name: 'Mới', updated_at: '2099-01-01T00:00:00Z' }] });
    expect(ledger.getSnapshot().gardens[0].name).toBe('Mới');

    await ledger.merge({ gardens: [{ ...garden, name: 'Quá cũ', updated_at: '2000-01-01T00:00:00Z' }] });
    expect(ledger.getSnapshot().gardens[0].name).toBe('Mới');
  });

  it('báo lỗi khi file sao lưu sai', () => {
    expect(() => parseBackup('abc')).toThrow('không đúng định dạng');
    expect(() => parseBackup('{"app":"khac"}')).toThrow('không đúng định dạng');
  });
});

describe('tổng kết', () => {
  const t = (type: 'income' | 'expense', amount: number, date: string) =>
    ({ id: date + amount, type, amount, date, garden_id: null, season_id: null, category_id: 'c', supply_id: null, note: null, updated_at: '', deleted_at: null }) as const;

  it('lời / lỗ', () => {
    expect(totals([t('income', 9_000_000, '2026-10-01'), t('expense', 2_400_000, '2026-10-02')])).toEqual({ income: 9_000_000, expense: 2_400_000, profit: 6_600_000 });
  });

  it('theo tháng, có cả tháng trống, qua năm', () => {
    const months = monthlyTotals([t('expense', 100, '2026-01-05'), t('income', 300, '2025-12-31')], 3, '2026-01-20');
    expect(months.map((m) => m.month)).toEqual(['2025-11', '2025-12', '2026-01']);
    expect(months.map((m) => m.profit)).toEqual([0, 300, -100]);
  });

  it('gom theo ngày', () => {
    const groups = groupByDate([t('expense', 1, '2026-10-14'), t('expense', 2, '2026-10-14'), t('income', 3, '2026-10-13')]);
    expect(groups.map((g) => [g.date, g.entries.length])).toEqual([['2026-10-14', 2], ['2026-10-13', 1]]);
  });
});

describe('bàn phím tiền', () => {
  it('gõ số, 000, triệu, xóa', () => {
    let amount = 0;
    for (const key of ['3', '5', '0', '000'] as const) amount = pressAmountKey(amount, key);
    expect(amount).toBe(350_000);
    expect(pressAmountKey(15, 'triệu')).toBe(15_000_000);
    expect(pressAmountKey(15, 'nghìn')).toBe(15_000);
    expect(pressAmountKey(350_000, 'xóa')).toBe(35_000);
    expect(pressAmountKey(350_000, 'C')).toBe(0);
  });

  it('không vượt quá giới hạn', () => {
    expect(pressAmountKey(999_999_999_999, '9')).toBe(999_999_999_999);
  });
});
