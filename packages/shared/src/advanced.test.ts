import { describe, expect, it } from 'vitest';
import { addMonths, allocatedEntries, contractSettlement, contractSummaries, cutOwing, debtsByParty, debtStatus, dueReminders, interestPaid, loanSchedule, monthlyInterest, debtSummary, seasonRange, seasonsOf, suggestSeasonName, supplyStock, supplyUsedValue } from './advanced';
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

    // Đã trả 500k: không cho sửa thành tiền xuống dưới; không sửa số nợ trực tiếp
    await ledger.payDebt({ debt_id: snap().debts[0].id, amount: 500_000 });
    await expect(ledger.updateSupply(thuoc.id, { unit_price: 100_000 })).rejects.toThrow('Đã trả 500.000 đ');
    await expect(ledger.updateDebt(snap().debts[0].id, { amount: 650_000 })).rejects.toThrow('đi theo vật tư');
    await ledger.updateDebt(snap().debts[0].id, { phone: '0912345678' });

    // Xóa khoản tiền ra trong danh sách = xóa cả vật tư
    const undo = await ledger.removeEntry(snap().transactions[0].id);
    expect([snap().supplies, snap().transactions, snap().supply_usages, snap().debts, snap().debt_payments].map((t) => t.length)).toEqual([0, 0, 0, 0, 0]);
    await undo();
    expect([snap().supplies, snap().transactions, snap().supply_usages, snap().debts, snap().debt_payments].map((t) => t.length)).toEqual([1, 1, 1, 1, 1]);
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
    expect(debtSummary(debtStatus(ledger.getSnapshot(), '2026-10-14'))).toEqual({ payable: 3_000_000, receivable: 8_000_000, loan: 0 });

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

describe('Bán cho lái (sầu riêng: cọc + cắt nhiều đợt)', () => {
  it('cọc chưa tính lời/lỗ; mỗi đợt tính giá trị hàng nhiều loại; trừ cọc từng đợt tùy nhập', async () => {
    const { ledger, a } = await setup();
    const snap = () => ledger.getSnapshot();
    const hd = await ledger.addContract({ garden_id: a.id, buyer: 'Tư Sầu Riêng', deposit: 100_000_000, date: '2026-07-20', crop: 'Sầu riêng Ri6' });
    expect(snap().transactions).toHaveLength(0);

    await ledger.addCut({
      contract_id: hd.id,
      date: '2026-08-10',
      lines: [
        { grade: 'Loại A', kg: 1200, price: 85_000 },
        { grade: 'Loại B', kg: 300, price: 60_000 },
        { grade: 'Hàng dạt', kg: 50, price: 20_000 },
      ],
      deposit_deduct: 30_000_000,
    });
    await ledger.addCut({ contract_id: hd.id, date: '2026-09-05', lines: [{ grade: 'Loại A', kg: 800, price: 90_000 }], deposit_deduct: 50_000_000 });

    let [sum] = contractSummaries(snap());
    expect(sum).toMatchObject({ delivered: 102_000_000 + 1_000_000 + 18_000_000 + 72_000_000, kg: 2350, deducted: 80_000_000, depositLeft: 20_000_000 });
    expect(sum.paidByCuts).toBe(sum.delivered - 80_000_000);
    // Lời/lỗ của vườn = giá trị hàng giao, không cộng cọc
    expect(totals(filterEntries(snap().transactions, { gardenId: a.id })).income).toBe(193_000_000);
    expect(snap().transactions.map((t) => t.note).sort()).toEqual(['Đợt 1 · lái Tư Sầu Riêng · 1550 kg', 'Đợt 2 · lái Tư Sầu Riêng · 800 kg']);

    await expect(ledger.addCut({ contract_id: hd.id, lines: [{ grade: 'Loại A', kg: 100, price: 90_000 }], deposit_deduct: 25_000_000 })).rejects.toThrow('Cọc chỉ còn 20.000.000 đ');
    await expect(ledger.addCut({ contract_id: hd.id, lines: [{ grade: 'Loại A', kg: 100, price: 90_000 }], deposit_deduct: 10_000_000 })).rejects.toThrow('lớn hơn tiền hàng đợt này');
    await expect(ledger.closeContract(hd.id)).rejects.toThrow('Còn 20.000.000 đ cọc chưa trừ');

    // Đợt cuối trừ nốt cọc rồi đóng
    const last = await ledger.addCut({ contract_id: hd.id, date: '2026-10-01', lines: [{ grade: 'Loại A', kg: 500, price: 80_000 }], deposit_deduct: 20_000_000 });
    await ledger.closeContract(hd.id, '2026-10-02');
    [sum] = contractSummaries(snap());
    expect(sum).toMatchObject({ depositLeft: 0, contract: { status: 'done' } });
    await expect(ledger.addCut({ contract_id: hd.id, lines: [{ grade: 'A', kg: 1, price: 1 }] })).rejects.toThrow('đã kết thúc');

    // Sửa đợt: tiền vào đổi theo
    await ledger.reopenContract(hd.id);
    await ledger.updateCut(last.id, { lines: [{ grade: 'Loại A', kg: 600, price: 80_000 }] });
    expect(snap().transactions.find((t) => t.id === last.transaction_id)!.amount).toBe(48_000_000);
    await expect(ledger.updateContract(hd.id, { deposit: 90_000_000 })).rejects.toThrow('Đã trừ 100.000.000 đ');
  });

  it('lái bỏ cọc: phần cọc chưa trừ thành tiền vào; mở lại thì bỏ khoản đó', async () => {
    const { ledger, a } = await setup();
    const hd = await ledger.addContract({ garden_id: a.id, buyer: 'Lái Năm', deposit: 100_000_000 });
    await ledger.addCut({ contract_id: hd.id, lines: [{ grade: 'Loại A', kg: 500, price: 80_000 }], deposit_deduct: 40_000_000 });
    await ledger.forfeitDeposit(hd.id);
    const income = () => totals(ledger.getSnapshot().transactions).income;
    expect(income()).toBe(40_000_000 + 60_000_000);
    expect(contractSummaries(ledger.getSnapshot())[0]).toMatchObject({ depositLeft: 0, contract: { status: 'forfeited' } });

    // Xóa khoản "bỏ cọc" trong danh sách = mở lại hợp đồng
    const forfeitEntry = ledger.getSnapshot().transactions.find((t) => t.note === 'Lái Lái Năm bỏ cọc')!;
    const undo = await ledger.removeEntry(forfeitEntry.id);
    expect(income()).toBe(40_000_000);
    expect(ledger.getSnapshot().harvest_contracts[0].status).toBe('open');
    await undo();
    expect(income()).toBe(100_000_000);
  });

  it('trả lại cọc: đúng phần còn lại thì không đổi lời/lỗ; đền thêm thì phần dư là tiền ra', async () => {
    const { ledger, a, b } = await setup();
    const one = await ledger.addContract({ garden_id: a.id, buyer: 'Lái Sáu', deposit: 50_000_000 });
    await expect(ledger.refundDeposit(one.id, 40_000_000)).rejects.toThrow('số trả lại không thể ít hơn');
    await ledger.refundDeposit(one.id, 50_000_000);
    expect(ledger.getSnapshot().transactions).toHaveLength(0);

    const two = await ledger.addContract({ garden_id: b.id, buyer: 'Lái Bảy', deposit: 50_000_000 });
    await ledger.refundDeposit(two.id, 100_000_000);
    expect(totals(ledger.getSnapshot().transactions)).toMatchObject({ income: 0, expense: 50_000_000 });

    // Vườn còn hợp đồng thì không cho xóa vườn; xóa hợp đồng thì xóa luôn khoản đi kèm
    await expect(ledger.removeGarden(b.id)).rejects.toThrow('còn hợp đồng');
    await ledger.removeContract(two.id);
    expect(ledger.getSnapshot().transactions).toHaveLength(0);
  });
});

describe('Khoản vay + nợ cửa hàng nhiều lần', () => {
  it('vay ngân hàng: gốc không tính lời/lỗ, lãi là tiền ra "Lãi vay"; xóa lần trả thì xóa luôn lãi', async () => {
    const { ledger } = await setup();
    const snap = () => ledger.getSnapshot();
    const loan = await ledger.addDebt({ kind: 'loan', party: 'Agribank', amount: 100_000_000, date: '2026-01-05', interest_rate: 9 });
    expect(snap().transactions).toHaveLength(0);
    expect(loan.interest_rate).toBe(9);
    expect(monthlyInterest(100_000_000, 9)).toBe(750_000);

    const p1 = await ledger.payDebt({ debt_id: loan.id, amount: 0, interest: 750_000, date: '2026-02-05' }); // chỉ trả lãi
    await ledger.payDebt({ debt_id: loan.id, amount: 40_000_000, interest: 750_000, date: '2026-03-05' });
    const lai = snap().transactions.filter((t) => t.note === 'Lãi vay Agribank');
    expect(lai).toHaveLength(2);
    expect(snap().categories.find((c) => c.id === lai[0].category_id)?.name).toBe('Lãi vay');
    expect(totals(snap().transactions)).toMatchObject({ income: 0, expense: 1_500_000 });
    expect(interestPaid(snap())).toBe(1_500_000);
    expect(debtSummary(debtStatus(snap(), '2026-10-15'))).toEqual({ payable: 0, receivable: 0, loan: 60_000_000 });

    const undo = await ledger.removePayment(p1.id);
    expect(totals(snap().transactions).expense).toBe(750_000);
    await undo();
    expect(totals(snap().transactions).expense).toBe(1_500_000);
    await expect(ledger.payDebt({ debt_id: loan.id, amount: 0, interest: 0 })).rejects.toThrow('lớn hơn 0');
  });

  it('mua thiếu cửa hàng 5 lần: gom theo cửa hàng, trả gộp trừ khoản cũ nhất trước', async () => {
    const { ledger, cat } = await setup();
    for (let i = 1; i <= 5; i++) {
      await ledger.addSupply({ name: `Phân lần ${i}`, category_id: cat('Phân bón'), unit: 'bao', quantity: 10, unit_price: 2_000_000, bought_on: `2026-0${i}-10`, shop_name: 'Cửa hàng A', on_credit: true });
    }
    let [shop] = debtsByParty(debtStatus(ledger.getSnapshot(), '2026-10-15'));
    expect(shop).toMatchObject({ party: 'Cửa hàng A', count: 5, amount: 100_000_000, left: 100_000_000 });
    // Phân mua thiếu đã tính vào lời/lỗ
    expect(totals(ledger.getSnapshot().transactions).expense).toBe(100_000_000);

    await expect(ledger.payParty({ kind: 'payable', party: 'Cửa hàng A', amount: 120_000_000 })).rejects.toThrow('chỉ còn 100.000.000 đ');
    expect(await ledger.payParty({ kind: 'payable', party: 'Cửa hàng A', amount: 50_000_000 })).toBe(3);
    const statuses = debtStatus(ledger.getSnapshot(), '2026-10-15');
    [shop] = debtsByParty(statuses);
    expect(shop.left).toBe(50_000_000);
    const byDate = statuses.sort((a, b) => a.debt.date.localeCompare(b.debt.date)).map((s) => s.left);
    expect(byDate).toEqual([0, 0, 10_000_000, 20_000_000, 20_000_000]);
    // Trả nợ không đổi lời/lỗ
    expect(totals(ledger.getSnapshot().transactions).expense).toBe(100_000_000);
  });

  it('sổ cũ chưa có hạng mục "Lãi vay" thì tự thêm khi mở', async () => {
    const storage = memoryStorage();
    const old = await Ledger.open(storage, now);
    const laiVay = old.getSnapshot().categories.find((c) => c.name === 'Lãi vay')!;
    await storage.save('categories', [{ ...laiVay, deleted_at: null, id: laiVay.id, updated_at: laiVay.updated_at, name: 'x' } as never]);
    // Giả lập sổ cũ: xóa hạng mục Lãi vay khỏi bộ nhớ lưu
    const { records, meta } = await storage.load();
    const store2 = memoryStorage();
    for (const [table, rows] of Object.entries(records)) await store2.save(table as never, (rows as SyncRecord[]).filter((r) => (r as { name?: string }).name !== 'x'));
    await store2.saveMeta(meta);
    const reopened = await Ledger.open(store2, now);
    expect(reopened.getSnapshot().categories.filter((c) => c.name === 'Lãi vay')).toHaveLength(1);
  });
});

describe('Lịch trả nợ vay + nhắc hạn', () => {
  it('addMonths: ngày cuối tháng không bị tràn sang tháng sau', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
    expect(addMonths('2026-01-10', 1, 5)).toBe('2026-02-05');
  });

  it('trả lãi hằng tháng, gốc cuối kỳ: 100tr, 9%/năm, 11 tháng → tổng lãi 8.250.000 đ', async () => {
    const { ledger } = await setup();
    const loan = await ledger.addDebt({ kind: 'loan', lender_type: 'bank', party: 'Agribank', amount: 100_000_000, date: '2026-01-05', interest_rate: 9, loan_plan: 'monthly_interest', term_months: 11 });
    expect(loan.due_on).toBe('2026-12-05');
    expect(loan.pay_day).toBe(5);
    let s = loanSchedule(loan, [], '2026-01-05')!;
    expect(s.items).toHaveLength(11);
    expect(s.items[0]).toMatchObject({ no: 1, due: '2026-02-05', principal: 0, interest: 750_000 });
    expect(s.items[10]).toMatchObject({ no: 11, due: '2026-12-05', principal: 100_000_000, interest: 750_000 });
    expect(s.interestTotal).toBe(8_250_000);

    // Trả kỳ 1, 2 đúng hạn; tới 15/04 thì kỳ 3 (05/04) quá hạn
    await ledger.payDebt({ debt_id: loan.id, amount: 0, interest: 750_000, installment: 1, date: '2026-02-05' });
    await ledger.payDebt({ debt_id: loan.id, amount: 0, interest: 750_000, installment: 2, date: '2026-03-05' });
    s = loanSchedule(loan, ledger.getSnapshot().debt_payments, '2026-04-15')!;
    expect(s).toMatchObject({ interestPaid: 1_500_000, interestLeft: 6_750_000, interestTotal: 8_250_000, next: { no: 3, overdue: true } });

    // Trả bớt 40tr gốc ở kỳ 3 → lãi các kỳ sau tính trên 60tr
    await ledger.payDebt({ debt_id: loan.id, amount: 40_000_000, interest: 750_000, installment: 3, date: '2026-04-15' });
    s = loanSchedule(loan, ledger.getSnapshot().debt_payments, '2026-04-15')!;
    expect(s.items[3].interest).toBe(450_000);
    expect(s.interestTotal).toBe(2_250_000 + 8 * 450_000);
    expect(s.principalLeft).toBe(60_000_000);
  });

  it('trả góp gốc đều + lãi dư nợ giảm dần; trả 1 lần cuối kỳ; lãi theo tháng (vay cá nhân)', async () => {
    const { ledger } = await setup();
    const gop = await ledger.addDebt({ kind: 'loan', party: 'BIDV', amount: 12_000_000, date: '2026-01-10', interest_rate: 12, loan_plan: 'equal_principal', term_months: 12, pay_day: 15 });
    const s1 = loanSchedule(gop, [], '2026-01-10')!;
    expect(s1.items.map((i) => i.principal)).toEqual(Array(12).fill(1_000_000));
    expect(s1.items.map((i) => i.interest).slice(0, 3)).toEqual([120_000, 110_000, 100_000]);
    expect(s1.items[0].due).toBe('2026-02-15');
    // Hạn trả hết nợ trùng ngày kỳ cuối (theo ngày trả 15), không báo quá hạn sớm
    expect(gop.due_on).toBe('2027-01-15');
    expect(s1.items.at(-1)!.due).toBe('2027-01-15');
    expect(s1.interestTotal).toBe(780_000); // 120k + 110k + … + 10k

    const motLan = await ledger.addDebt({ kind: 'loan', lender_type: 'person', party: 'Chú Sáu', amount: 50_000_000, date: '2026-03-01', interest_rate: 1.5, rate_unit: 'month', loan_plan: 'lump_sum', term_months: 6 });
    const s2 = loanSchedule(motLan, [], '2026-03-01')!;
    expect(s2.items).toEqual([expect.objectContaining({ no: 1, due: '2026-09-01', principal: 50_000_000, interest: 4_500_000 })]);
    expect(monthlyInterest(50_000_000, motLan)).toBe(750_000);
  });

  it('nhắc hạn: kỳ vay sắp tới / quá hạn và nợ có hẹn ngày trả', async () => {
    const { ledger } = await setup();
    await ledger.addDebt({ kind: 'loan', party: 'Agribank', amount: 100_000_000, date: '2026-09-20', interest_rate: 9, loan_plan: 'monthly_interest', term_months: 6 });
    await ledger.addDebt({ kind: 'payable', party: 'Cửa hàng A', amount: 5_000_000, date: '2026-09-01', due_on: '2026-10-10', record_entry: false });
    await ledger.addDebt({ kind: 'payable', party: 'Cửa hàng B', amount: 5_000_000, date: '2026-09-01', due_on: '2026-12-10', record_entry: false });
    const list = dueReminders(ledger.getSnapshot(), '2026-10-15', 7);
    expect(list.map((r) => [r.title, r.due, r.overdue])).toEqual([
      ['Cửa hàng A: hạn trả nợ 5.000.000 đ', '2026-10-10', true],
      ['Agribank: kỳ 1, lãi 750.000 đ', '2026-10-20', false],
    ]);
  });
});

describe('Bán cho lái: lái còn nợ', () => {
  it('đợt trả 1 phần thì lái còn nợ; lái trả thêm chia vào đợt cũ trước; đợt cũ không có paid coi như trả đủ', async () => {
    const { ledger, a } = await setup();
    const hd = await ledger.addContract({ garden_id: a.id, buyer: 'Lái Tư', deposit: 50_000_000, date: '2026-08-01' });
    // Đợt 1: 80 tr, trừ cọc 30 tr, lái mới trả 20 tr → còn nợ 30 tr
    const c1 = await ledger.addCut({ contract_id: hd.id, date: '2026-08-20', lines: [{ grade: 'A', kg: 1000, price: 80_000 }], deposit_deduct: 30_000_000, paid: 20_000_000 });
    // Đợt 2: 45 tr, trừ cọc 20 tr, chưa trả → còn nợ 25 tr
    await ledger.addCut({ contract_id: hd.id, date: '2026-09-20', lines: [{ grade: 'A', kg: 500, price: 90_000 }], deposit_deduct: 20_000_000, paid: 0 });
    const summary = () => contractSummaries(ledger.getSnapshot())[0];
    expect(summary()).toMatchObject({ delivered: 125_000_000, paidByCuts: 20_000_000, owing: 55_000_000 });
    // Lời / lỗ vẫn theo tiền hàng đã giao
    expect(contractSettlement(summary(), ledger.getSnapshot().transactions)).toMatchObject({ profit: 125_000_000, received: 70_000_000, owing: 55_000_000 });

    // Lái trả thêm 40 tr: trả hết đợt 1 (30 tr) trước, rồi 10 tr cho đợt 2
    expect(await ledger.payContractOwing(hd.id, 40_000_000)).toBe(40_000_000);
    expect(summary().cuts.map((c) => cutOwing(c))).toEqual([0, 15_000_000]);
    // Trả dư: chỉ ghi phần còn nợ
    expect(await ledger.payContractOwing(hd.id, 99_000_000)).toBe(15_000_000);
    expect(summary().owing).toBe(0);
    // Đợt trả đủ lưu null (giống đợt ghi trước khi có trường "lái trả")
    expect(ledger.getSnapshot().harvest_cuts.find((c) => c.id === c1.id)?.paid).toBeNull();

    // Đợt ghi kiểu cũ (không có paid) = trả đủ; sửa đợt: trả vượt số phải trả thì coi là trả đủ
    await ledger.updateCut(c1.id, { paid: 999_000_000 });
    expect(cutOwing(summary().cuts[0])).toBe(0);
  });
});

describe('Hoàn tất hợp đồng bán cho lái (quyết toán)', () => {
  const twoCuts = async () => {
    const { ledger, a } = await setup();
    const hd = await ledger.addContract({ garden_id: a.id, buyer: 'Lái Tư', deposit: 100_000_000, date: '2026-08-01' });
    // Cắt 2 đợt, mới trừ cọc 30tr + 20tr
    await ledger.addCut({ contract_id: hd.id, date: '2026-08-20', lines: [{ grade: 'Loại A', kg: 1000, price: 80_000 }], deposit_deduct: 30_000_000 });
    await ledger.addCut({ contract_id: hd.id, date: '2026-09-20', lines: [{ grade: 'Loại A', kg: 900, price: 90_000 }], deposit_deduct: 20_000_000 });
    const summary = () => contractSummaries(ledger.getSnapshot())[0];
    return { ledger, hd, summary, settlement: () => contractSettlement(summary(), ledger.getSnapshot().transactions) };
  };

  it('trừ nốt cọc còn dư vào tiền hàng (đợt cuối trước) rồi đóng', async () => {
    const { ledger, hd, summary, settlement } = await twoCuts();
    expect(settlement().deductRoom).toBe(161_000_000 - 50_000_000);
    await ledger.settleContract(hd.id, 'deduct');
    expect(summary()).toMatchObject({ depositLeft: 0, deducted: 100_000_000, contract: { status: 'done' } });
    expect(summary().cuts.map((c) => c.deposit_deduct)).toEqual([30_000_000, 70_000_000]);
    expect(settlement()).toMatchObject({ delivered: 161_000_000, received: 161_000_000, profit: 161_000_000, refunded: 0 });
  });

  it('trả lại phần cọc dư / lái bỏ phần cọc dư', async () => {
    let t = await twoCuts();
    await t.ledger.settleContract(t.hd.id, 'refund');
    expect(t.settlement()).toMatchObject({ refunded: 50_000_000, received: 100_000_000 + 111_000_000 - 50_000_000, profit: 161_000_000 });

    t = await twoCuts();
    await t.ledger.settleContract(t.hd.id, 'forfeit');
    expect(t.settlement()).toMatchObject({ forfeited: 50_000_000, received: 211_000_000, profit: 211_000_000 });
  });

  it('tiền hàng ít hơn cọc thì không trừ nốt được, phải trả lại hoặc lái bỏ', async () => {
    const { ledger, a } = await setup();
    const hd = await ledger.addContract({ garden_id: a.id, buyer: 'Lái Năm', deposit: 100_000_000 });
    await ledger.addCut({ contract_id: hd.id, lines: [{ grade: 'Loại A', kg: 500, price: 80_000 }], deposit_deduct: 0 });
    await expect(ledger.settleContract(hd.id, 'deduct')).rejects.toThrow('thiếu 60.000.000 đ');
  });
});

describe('formatQtyGrouped', () => {
  it('nhóm hàng nghìn bằng dấu chấm, phần lẻ dấu phẩy', async () => {
    const { formatQtyGrouped } = await import('./advanced');
    expect(formatQtyGrouped(1200)).toBe('1.200');
    expect(formatQtyGrouped(1234.5)).toBe('1.234,5');
    expect(formatQtyGrouped(0.5)).toBe('0,5');
    expect(formatQtyGrouped(1_000_000)).toBe('1.000.000');
  });
});
