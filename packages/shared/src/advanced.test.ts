import { describe, expect, it } from 'vitest';
import { allocatedEntries, debtStatus, debtSummary, seasonRange, seasonsOf, suggestSeasonName, supplyStock, supplyUsedValue } from './advanced';
import { filterEntries, Ledger, totals, type LedgerMeta, type LedgerStorage } from './ledger';
import type { SyncRecord } from './types';

function memoryStorage(): LedgerStorage {
  const tables: Record<string, Map<string, SyncRecord>> = {};
  let meta: LedgerMeta = {};
  return {
    load: async () => ({ records: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, [...v.values()]])), meta }),
    save: async (table, records) => {
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
}

let clock = new Date('2026-10-14T08:00:00Z').getTime();
const now = () => new Date((clock += 1000));

async function setup() {
  const ledger = await Ledger.open(memoryStorage(), now);
  const a = await ledger.addGarden({ name: 'Vườn A' });
  const b = await ledger.addGarden({ name: 'Vườn B' });
  const cat = (name: string) => ledger.getSnapshot().categories.find((c) => c.name === name)!.id;
  return { ledger, a, b, cat };
}

describe('Mùa vụ', () => {
  it('khoản thu chi thuộc vụ theo ngày; sửa ngày vụ thì tự tính lại', async () => {
    const { ledger, a, cat } = await setup();
    const vu = await ledger.addSeason({ garden_id: a.id, name: 'Vụ 2025', started_on: '2025-05-01', ended_on: '2026-02-28' });
    await ledger.addEntry({ type: 'expense', amount: 1_000_000, category_id: cat('Phân bón'), garden_id: a.id, date: '2025-06-01' });
    await ledger.addEntry({ type: 'income', amount: 30_000_000, category_id: cat('Bán nông sản'), garden_id: a.id, date: '2026-01-15' });
    await ledger.addEntry({ type: 'expense', amount: 500_000, category_id: cat('Thuốc'), garden_id: a.id, date: '2026-04-01' });

    const inSeason = (season = ledger.getSnapshot().seasons[0]) => totals(filterEntries(ledger.getSnapshot().transactions, { gardenId: a.id, ...seasonRange(season) }));
    expect(inSeason()).toEqual({ income: 30_000_000, expense: 1_000_000, profit: 29_000_000 });

    await ledger.updateSeason(vu.id, { ended_on: '2026-04-30' });
    expect(inSeason().expense).toBe(1_500_000);
  });

  it('không cho 2 vụ của cùng vườn trùng ngày; vườn khác thì được', async () => {
    const { ledger, a, b } = await setup();
    await ledger.addSeason({ garden_id: a.id, name: 'Vụ 2026', started_on: '2026-05-01' });
    await expect(ledger.addSeason({ garden_id: a.id, name: 'Vụ chồng', started_on: '2026-09-01' })).rejects.toThrow('Trùng thời gian với vụ "Vụ 2026"');
    await expect(ledger.addSeason({ garden_id: a.id, name: 'Sai ngày', started_on: '2025-05-01', ended_on: '2025-01-01' })).rejects.toThrow('Ngày kết thúc');
    await ledger.addSeason({ garden_id: b.id, name: 'Vụ 2026', started_on: '2026-05-01' });
    await ledger.addSeason({ garden_id: a.id, name: 'Vụ 2025', started_on: '2025-05-01', ended_on: '2026-04-30' });
    expect(seasonsOf(ledger.getSnapshot().seasons, a.id).map((s) => s.name)).toEqual(['Vụ 2026', 'Vụ 2025']);
    expect(suggestSeasonName(ledger.getSnapshot().seasons, a.id, '2026-10-14')).toBe('Vụ 2026 (2)');
  });
});

describe('Kho vật tư', () => {
  it('mua về kho ghi tiền ra chi chung; dùng cho vườn nào thì tiền tính vào vườn đó, tổng sổ không đổi', async () => {
    const { ledger, a, b, cat } = await setup();
    const npk = await ledger.addSupply({ name: 'NPK 16-16-8', category_id: cat('Phân bón'), unit: 'bao', quantity: 10, unit_price: 600_000, bought_on: '2026-10-01', shop_name: 'Đại lý Hai Lúa' });
    const snap = () => ledger.getSnapshot();
    expect(snap().transactions[0]).toMatchObject({ type: 'expense', amount: 6_000_000, garden_id: null, supply_id: npk.id, note: '10 bao NPK 16-16-8 · Đại lý Hai Lúa' });

    await ledger.useSupply({ supply_id: npk.id, garden_id: a.id, quantity: 6, used_on: '2026-10-05' });
    await ledger.useSupply({ supply_id: npk.id, garden_id: b.id, quantity: 2.5, used_on: '2026-10-06' });

    const entries = allocatedEntries(snap());
    const of = (gardenId: string | null) => totals(filterEntries(entries, { gardenId })).expense;
    expect(of(a.id)).toBe(3_600_000);
    expect(of(b.id)).toBe(1_500_000);
    expect(of(null)).toBe(900_000); // phần còn trong kho
    expect(totals(entries).expense).toBe(6_000_000);
    expect(supplyUsedValue(snap(), a.id)).toBe(3_600_000);
    expect(supplyStock(snap())[0]).toMatchObject({ used: 8.5, left: 1.5, leftValue: 900_000 });

    await expect(ledger.useSupply({ supply_id: npk.id, garden_id: a.id, quantity: 2 })).rejects.toThrow('Trong kho chỉ còn 1,5 bao');
    await expect(ledger.updateSupply(npk.id, { quantity: 8 })).rejects.toThrow('Đã dùng 8,5 bao');
  });

  it('sửa giá: khoản tiền ra và nợ mua thiếu đổi theo; xóa vật tư xóa luôn khoản đi kèm, hoàn tác được', async () => {
    const { ledger, a, cat } = await setup();
    const thuoc = await ledger.addSupply({ name: 'Thuốc rầy', category_id: cat('Thuốc'), unit: 'chai', quantity: 4, unit_price: 150_000, shop_name: 'Cô Ba', on_credit: true, use_for: a.id });
    const snap = () => ledger.getSnapshot();
    expect(snap().debts[0]).toMatchObject({ kind: 'payable', party: 'Cô Ba', amount: 600_000, supply_id: thuoc.id });
    expect(supplyStock(snap())[0].left).toBe(0);

    await ledger.updateSupply(thuoc.id, { unit_price: 175_000 });
    expect(snap().transactions[0].amount).toBe(700_000);
    expect(snap().debts[0].amount).toBe(700_000);
    expect(totals(filterEntries(allocatedEntries(snap()), { gardenId: a.id })).expense).toBe(700_000);

    // Xóa khoản tiền ra trong danh sách = xóa cả vật tư
    const undo = await ledger.removeEntry(snap().transactions[0].id);
    expect([snap().supplies, snap().transactions, snap().supply_usages, snap().debts].map((t) => t.length)).toEqual([0, 0, 0, 0]);
    await undo();
    expect([snap().supplies, snap().transactions, snap().supply_usages, snap().debts].map((t) => t.length)).toEqual([1, 1, 1, 1]);
  });

  it('xóa vườn: vật tư đã dùng trả về kho, vụ của vườn bị xóa; hoàn tác thì lấy lại', async () => {
    const { ledger, a, cat } = await setup();
    const s = await ledger.addSupply({ name: 'Ure', category_id: cat('Phân bón'), unit: 'bao', quantity: 2, unit_price: 500_000 });
    await ledger.useSupply({ supply_id: s.id, garden_id: a.id, quantity: 2 });
    await ledger.addSeason({ garden_id: a.id, name: 'Vụ 2026', started_on: '2026-01-01' });

    const undo = await ledger.removeGarden(a.id);
    expect(supplyStock(ledger.getSnapshot())[0].left).toBe(2);
    expect(ledger.getSnapshot().seasons).toHaveLength(0);
    await undo();
    expect(supplyStock(ledger.getSnapshot())[0].left).toBe(0);
    expect(ledger.getSnapshot().seasons).toHaveLength(1);
  });
});

describe('Công nợ', () => {
  it('bán chịu ghi tiền vào ngay; thu nợ từng lần, không thu quá số còn nợ', async () => {
    const { ledger, a, cat } = await setup();
    const debt = await ledger.addDebt({ kind: 'receivable', party: 'Thương lái Tư', amount: 20_000_000, garden_id: a.id, category_id: cat('Bán nông sản'), date: '2026-10-01', due_on: '2026-10-10' });
    const snap = () => ledger.getSnapshot();
    expect(snap().transactions[0]).toMatchObject({ type: 'income', amount: 20_000_000, garden_id: a.id, note: 'Bán chịu: Thương lái Tư' });

    await ledger.payDebt({ debt_id: debt.id, amount: 15_000_000 });
    await expect(ledger.payDebt({ debt_id: debt.id, amount: 6_000_000 })).rejects.toThrow('Chỉ còn nợ 5.000.000 đ');
    let [status] = debtStatus(snap(), '2026-10-14');
    expect(status).toMatchObject({ paid: 15_000_000, left: 5_000_000, overdue: true });

    await ledger.payDebt({ debt_id: debt.id, amount: 5_000_000 });
    [status] = debtStatus(snap(), '2026-10-14');
    expect(status).toMatchObject({ left: 0, overdue: false });
    // Trả nợ không tính lại vào lời/lỗ
    expect(totals(snap().transactions).income).toBe(20_000_000);
  });

  it('nợ đã ghi trong sổ rồi thì không ghi thêm khoản; tổng còn nợ hai chiều; xóa nợ xóa luôn khoản đi kèm', async () => {
    const { ledger } = await setup();
    await ledger.addDebt({ kind: 'payable', party: 'Đại lý A', amount: 3_000_000, record_entry: false });
    const sold = await ledger.addDebt({ kind: 'receivable', party: 'Anh Năm', amount: 8_000_000 });
    expect(ledger.getSnapshot().transactions).toHaveLength(1);
    expect(debtSummary(debtStatus(ledger.getSnapshot(), '2026-10-14'))).toEqual({ payable: 3_000_000, receivable: 8_000_000 });

    await ledger.updateDebt(sold.id, { amount: 9_000_000 });
    expect(ledger.getSnapshot().transactions[0].amount).toBe(9_000_000);

    const undo = await ledger.removeEntry(ledger.getSnapshot().transactions[0].id);
    expect(ledger.getSnapshot().debts).toHaveLength(1);
    expect(ledger.getSnapshot().transactions).toHaveLength(0);
    await undo();
    expect(ledger.getSnapshot().debts).toHaveLength(2);
  });
});

describe('Sao lưu và đồng bộ có dữ liệu Nâng cao', () => {
  it('sao lưu đủ các bảng mới; file sao lưu cũ (chỉ 3 bảng) vẫn nhập được', async () => {
    const { ledger, a, cat } = await setup();
    const s = await ledger.addSupply({ name: 'Ure', category_id: cat('Phân bón'), unit: 'bao', quantity: 2, unit_price: 500_000 });
    await ledger.useSupply({ supply_id: s.id, garden_id: a.id, quantity: 1 });
    await ledger.addSeason({ garden_id: a.id, name: 'Vụ 2026', started_on: '2026-01-01' });
    const debt = await ledger.addDebt({ kind: 'payable', party: 'Đại lý', amount: 1_000_000 });
    await ledger.payDebt({ debt_id: debt.id, amount: 400_000 });

    const other = await Ledger.open(memoryStorage(), now);
    await other.importBackup(JSON.stringify(ledger.exportBackup()));
    const snap = other.getSnapshot();
    expect([snap.seasons, snap.supplies, snap.supply_usages, snap.debts, snap.debt_payments].map((t) => t.length)).toEqual([1, 1, 1, 1, 1]);

    const oldFile = { app: 'nha-nong', kind: 'ledger-backup', version: 1, exported_at: '2026-10-01T00:00:00Z', records: { gardens: [], categories: [], transactions: [] } };
    await expect(other.importBackup(JSON.stringify(oldFile))).resolves.toBe(0);
  });
});
