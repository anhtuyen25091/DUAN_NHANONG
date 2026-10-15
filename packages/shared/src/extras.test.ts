import { describe, expect, it } from 'vitest';
import { costPerUnit, fieldLines, formatDays, harvestTotals, parseFieldInput, toKg, workerBalances } from './extras';
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

let clock = new Date('2026-10-15T08:00:00Z').getTime();
const now = () => new Date((clock += 1000));

async function setup() {
  const storage = memoryStorage();
  const ledger = await Ledger.open(storage, now);
  const a = await ledger.addGarden({ name: 'Vườn A', crop: 'Cà phê' });
  const b = await ledger.addGarden({ name: 'Vườn B' });
  const cat = (name: string) => ledger.getSnapshot().categories.find((c) => c.name === name)!.id;
  return { ledger, storage, a, b, cat };
}

describe('Khoản hay dùng', () => {
  it('lưu mẫu rồi ghi nhanh: đủ hạng mục, số tiền, vườn, ghi chú; đổi được số tiền lúc ghi', async () => {
    const { ledger, a, cat } = await setup();
    const t = await ledger.addTemplate({ type: 'expense', amount: 350_000, category_id: cat('Thuốc'), garden_id: a.id, note: 'Xịt thuốc vườn sau' });
    expect(t.label).toBe('Thuốc – Xịt thuốc vườn sau');

    const e1 = await ledger.useTemplate(t.id);
    expect(e1).toMatchObject({ type: 'expense', amount: 350_000, garden_id: a.id, note: 'Xịt thuốc vườn sau' });
    const e2 = await ledger.useTemplate(t.id, { amount: 400_000, date: '2026-10-01' });
    expect(e2).toMatchObject({ amount: 400_000, date: '2026-10-01' });
    expect(ledger.getSnapshot().transactions).toHaveLength(2);
  });

  it('lưu từ khoản đã ghi; vườn của mẫu bị xóa thì ghi vào chi chung', async () => {
    const { ledger, a, cat } = await setup();
    const entry = await ledger.addEntry({ type: 'expense', amount: 1_500_000, category_id: cat('Nhân công'), garden_id: a.id, note: '5 công làm cỏ' });
    const t = await ledger.templateFromEntry(entry.id, 'Làm cỏ');
    expect(t).toMatchObject({ label: 'Làm cỏ', amount: 1_500_000, garden_id: a.id });

    await ledger.removeGarden(a.id);
    expect((await ledger.useTemplate(t.id)).garden_id).toBeNull();
  });

  it('không cho mẫu 0 đồng; xóa mẫu có hoàn tác', async () => {
    const { ledger, cat } = await setup();
    await expect(ledger.addTemplate({ type: 'expense', amount: 0, category_id: cat('Thuốc'), garden_id: null })).rejects.toThrow('lớn hơn 0');
    const t = await ledger.addTemplate({ type: 'income', amount: 1000, category_id: cat('Thu khác'), garden_id: null, label: 'Thu tiền' });
    const undo = await ledger.removeTemplate(t.id);
    expect(ledger.getSnapshot().templates).toHaveLength(0);
    await undo();
    expect(ledger.getSnapshot().templates).toHaveLength(1);
  });
});

describe('Thu hoạch', () => {
  it('ghi sản lượng có giá bán → tự ghi tiền vào; giá thành / kg = tiền chi / số kg', async () => {
    const { ledger, a, cat } = await setup();
    await ledger.addEntry({ type: 'expense', amount: 9_000_000, category_id: cat('Phân bón'), garden_id: a.id, date: '2026-09-01' });
    const h = await ledger.addHarvest({ garden_id: a.id, date: '2026-10-10', quantity: 1200, unit: 'kg', price: 45_000 });
    expect(h.crop).toBe('Cà phê'); // lấy theo cây trồng của vườn
    const entry = ledger.getSnapshot().transactions.find((t) => t.id === h.transaction_id)!;
    expect(entry).toMatchObject({ type: 'income', amount: 54_000_000, garden_id: a.id, date: '2026-10-10' });
    expect(entry.note).toBe('Bán 1.200 kg cà phê × 45.000 đ');

    const sum = harvestTotals(ledger.getSnapshot(), a.id);
    expect(sum.kg).toBe(1200);
    const expense = totals(filterEntries(ledger.getSnapshot().transactions, { gardenId: a.id })).expense;
    expect(costPerUnit(expense, sum.kg)).toBe(7500);
  });

  it('sửa giá: khoản tiền vào cập nhật theo; bỏ giá: khoản tiền vào bị xóa', async () => {
    const { ledger, a } = await setup();
    const h = await ledger.addHarvest({ garden_id: a.id, quantity: 100, price: 45_000 });
    await ledger.updateHarvest(h.id, { quantity: 120 });
    expect(ledger.getSnapshot().transactions.find((t) => t.id === h.transaction_id)!.amount).toBe(5_400_000);

    await ledger.updateHarvest(h.id, { price: null });
    expect(ledger.getSnapshot().transactions).toHaveLength(0);
    expect(ledger.getSnapshot().harvests[0].transaction_id).toBeNull();
  });

  it('xóa khoản tiền bán ở sổ = xóa luôn sản lượng (không lệch số), có hoàn tác', async () => {
    const { ledger, a } = await setup();
    const h = await ledger.addHarvest({ garden_id: a.id, quantity: 100, price: 45_000 });
    const undo = await ledger.removeEntry(h.transaction_id!);
    expect(ledger.getSnapshot().harvests).toHaveLength(0);
    await undo();
    expect(ledger.getSnapshot().harvests).toHaveLength(1);
    expect(ledger.getSnapshot().transactions).toHaveLength(1);
  });

  it('sản lượng cộng cả số kg đã cắt bán cho lái; đơn vị khác kg (trái) để riêng', async () => {
    const { ledger, a } = await setup();
    const contract = await ledger.addContract({ garden_id: a.id, buyer: 'Tư', deposit: 10_000_000, date: '2026-09-01' });
    await ledger.addCut({ contract_id: contract.id, date: '2026-10-01', lines: [{ grade: 'Loại A', kg: 800, price: 80_000 }] });
    await ledger.addHarvest({ garden_id: a.id, quantity: 200, unit: 'kg', date: '2026-10-05' });
    await ledger.addHarvest({ garden_id: a.id, quantity: 50, unit: 'trái', date: '2026-10-05' });

    const sum = harvestTotals(ledger.getSnapshot(), a.id);
    expect(sum).toMatchObject({ kg: 1000, cutKg: 800 });
    expect(sum.byUnit).toEqual(expect.arrayContaining([{ unit: 'kg', quantity: 1000 }, { unit: 'trái', quantity: 50 }]));
  });

  it('chặn số lượng 0 và vườn không có', async () => {
    const { ledger, a } = await setup();
    await expect(ledger.addHarvest({ garden_id: a.id, quantity: 0 })).rejects.toThrow('lớn hơn 0');
    await expect(ledger.addHarvest({ garden_id: 'khong-co', quantity: 1 })).rejects.toThrow('chọn vườn');
  });
});

describe('Nhân công', () => {
  it('chấm công 2 vườn, trả công → mỗi vườn 1 khoản "Nhân công" đúng tiền', async () => {
    const { ledger, a, b, cat } = await setup();
    const ba = await ledger.addWorker({ name: 'Anh Ba', wage: 300_000 });
    const tu = await ledger.addWorker({ name: 'Chị Tư', wage: 250_000 });
    await ledger.addWorkDay({ date: '2026-10-10', garden_id: a.id, workers: [{ worker_id: ba.id, days: 1 }, { worker_id: tu.id, days: 0.5 }] });
    await ledger.addWorkDay({ date: '2026-10-11', garden_id: b.id, workers: [{ worker_id: ba.id, days: 1 }] });

    const before = workerBalances(ledger.getSnapshot());
    expect(before.find((w) => w.worker.id === ba.id)).toMatchObject({ unpaidDays: 2, owed: 600_000 });
    expect(before.find((w) => w.worker.id === tu.id)).toMatchObject({ unpaidDays: 0.5, owed: 125_000 });

    await ledger.payWorker(ba.id, { date: '2026-10-12' });
    const paid = ledger.getSnapshot().transactions;
    expect(paid.map((t) => [t.garden_id, t.amount, t.category_id])).toEqual(
      expect.arrayContaining([
        [a.id, 300_000, cat('Nhân công')],
        [b.id, 300_000, cat('Nhân công')],
      ]),
    );
    expect(workerBalances(ledger.getSnapshot()).find((w) => w.worker.id === ba.id)).toMatchObject({ owed: 0, paid: 600_000 });
  });

  it('đổi tiền công không làm lệch ngày công đã chấm', async () => {
    const { ledger, a } = await setup();
    const ba = await ledger.addWorker({ name: 'Anh Ba', wage: 300_000 });
    await ledger.addWorkDay({ garden_id: a.id, workers: [{ worker_id: ba.id, days: 1 }] });
    await ledger.updateWorker(ba.id, { wage: 350_000 });
    await ledger.addWorkDay({ garden_id: a.id, workers: [{ worker_id: ba.id, days: 1 }] });
    expect(workerBalances(ledger.getSnapshot())[0].owed).toBe(650_000);
  });

  it('xóa khoản trả công ở sổ = bỏ lần trả; ngày công đã trả không sửa / xóa được', async () => {
    const { ledger, a } = await setup();
    const ba = await ledger.addWorker({ name: 'Anh Ba', wage: 300_000 });
    const [log] = await ledger.addWorkDay({ garden_id: a.id, workers: [{ worker_id: ba.id, days: 1 }] });
    await ledger.payWorker(ba.id);

    await expect(ledger.removeWorkLog(log.id)).rejects.toThrow('đã trả tiền');
    await expect(ledger.removeWorker(ba.id)).resolves.toBeTypeOf('function');

    const { ledger: l2, a: a2 } = await setup();
    const w = await l2.addWorker({ name: 'Chị Năm', wage: 200_000 });
    await l2.addWorkDay({ garden_id: a2.id, workers: [{ worker_id: w.id, days: 2 }] });
    const undoPay = await l2.payWorker(w.id);
    const payment = l2.getSnapshot().transactions[0];
    await l2.removeEntry(payment.id);
    expect(workerBalances(l2.getSnapshot())[0]).toMatchObject({ owed: 400_000 });
    expect(l2.getSnapshot().transactions).toHaveLength(0);
    // Hoàn tác lần trả (đã bị bỏ) không làm hỏng dữ liệu
    await undoPay();
    expect(workerBalances(l2.getSnapshot())[0].owed).toBe(400_000);
  });

  it('không xóa người còn công chưa trả; xóa vườn thì ngày công chuyển sang chi chung', async () => {
    const { ledger, a } = await setup();
    const ba = await ledger.addWorker({ name: 'Anh Ba', wage: 300_000 });
    await ledger.addWorkDay({ garden_id: a.id, workers: [{ worker_id: ba.id, days: 1 }] });
    await expect(ledger.removeWorker(ba.id)).rejects.toThrow('còn công chưa trả');

    await ledger.removeGarden(a.id);
    expect(ledger.getSnapshot().work_logs[0].garden_id).toBeNull();
  });

  it('chấm công không chọn ai thì báo lỗi', async () => {
    const { ledger, a } = await setup();
    await expect(ledger.addWorkDay({ garden_id: a.id, workers: [] })).rejects.toThrow('ít nhất 1 người');
  });
});

describe('Ô thông tin tự thêm', () => {
  it('thêm ô cho vườn, nhập giá trị, đổi tên ô vẫn giữ giá trị; mở lại sổ vẫn còn', async () => {
    const { ledger, storage, a } = await setup();
    const goc = await ledger.addCustomField({ target: 'garden', label: 'Số gốc cây', type: 'number' });
    const giong = await ledger.addCustomField({ target: 'garden', label: 'Giống', type: 'select', options: ['TR4', 'TR9', ' TR4 ', ''] });
    expect(giong.options).toEqual(['TR4', 'TR9']);

    await ledger.setExtra('garden', a.id, { [goc.key]: 1200, [giong.key]: 'TR9' });
    await ledger.updateCustomField(goc.id, { label: 'Số gốc' });

    const reopened = await Ledger.open(storage, now);
    const snap = reopened.getSnapshot();
    expect(fieldLines(snap.custom_fields, 'garden', snap.gardens.find((g) => g.id === a.id)!.extra)).toEqual([
      { label: 'Số gốc', value: '1.200' },
      { label: 'Giống', value: 'TR9' },
    ]);
  });

  it('giá trị rỗng thì xóa; giữ các khóa khác trong extra (vd đơn mua bán)', async () => {
    const { ledger, a, cat } = await setup();
    const f = await ledger.addCustomField({ target: 'transaction', label: 'Người mua', type: 'text' });
    const entry = await ledger.addEntry({ type: 'income', amount: 1000, category_id: cat('Bán nông sản'), garden_id: a.id });
    await ledger.setExtra('transaction', entry.id, { [f.key]: 'Lái Tư' });
    await ledger.setExtra('transaction', entry.id, { [f.key]: '' });
    expect(ledger.getSnapshot().transactions[0].extra).toEqual({});
  });

  it('chặn ô trùng tên, ô lựa chọn thiếu lựa chọn', async () => {
    const { ledger } = await setup();
    await ledger.addCustomField({ target: 'garden', label: 'Giống', type: 'text' });
    await expect(ledger.addCustomField({ target: 'garden', label: 'giống', type: 'text' })).rejects.toThrow('Đã có');
    await expect(ledger.addCustomField({ target: 'supply', label: 'Loại', type: 'select', options: ['A'] })).rejects.toThrow('ít nhất 2');
  });

  it('đổi chữ gõ thành giá trị', () => {
    expect(parseFieldInput({ type: 'number' }, '2,5')).toBe(2.5);
    expect(parseFieldInput({ type: 'number' }, '1.200')).toBe(1200);
    expect(parseFieldInput({ type: 'number' }, 'abc')).toBeNull();
    expect(parseFieldInput({ type: 'text' }, '  ')).toBeNull();
  });
});

describe('tiện ích', () => {
  it('quy đổi kg, giá thành, ngày công', () => {
    expect(toKg(2, 'tạ')).toBe(200);
    expect(toKg(3, 'trái')).toBeNull();
    expect(costPerUnit(1000, 0)).toBeNull();
    expect(formatDays(0.5)).toBe('nửa ngày');
    expect(formatDays(2.5)).toBe('2,5 ngày');
  });
});
