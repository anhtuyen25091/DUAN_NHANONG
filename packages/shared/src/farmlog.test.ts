import { describe, expect, it } from 'vitest';
import { allocatedEntries } from './advanced';
import { farmLogText, withholdingOn } from './farmlog';
import { Ledger, totals, type LedgerMeta, type LedgerStorage } from './ledger';
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

let clock = new Date('2026-10-22T08:00:00Z').getTime();
const now = () => new Date((clock += 1000));

async function setup() {
  const ledger = await Ledger.open(memoryStorage(), now);
  const a = await ledger.addGarden({ name: 'Vườn sầu riêng', crop: 'Sầu riêng', area_m2: 10000 });
  const b = await ledger.addGarden({ name: 'Vườn cà phê' });
  const cat = (name: string) => ledger.getSnapshot().categories.find((c) => c.name === name)!.id;
  return { ledger, a, b, cat };
}

describe('Nhật ký canh tác', () => {
  it('lấy thuốc từ kho: tự ghi "dùng cho vườn"; xóa nhật ký thì thuốc trả về kho', async () => {
    const { ledger, a, cat } = await setup();
    const thuoc = await ledger.addSupply({ name: 'Regent 800WG', category_id: cat('Thuốc'), unit: 'gói', quantity: 10, unit_price: 50_000 });
    const log = await ledger.addFarmLog({ garden_id: a.id, date: '2026-10-16', kind: 'spray', title: '', supply_id: thuoc.id, quantity: 4, target: 'sâu đục thân', withholding_days: 14 });

    expect(log.title).toBe('Regent 800WG');
    expect(log.unit).toBe('gói');
    const usage = ledger.getSnapshot().supply_usages.find((u) => u.id === log.supply_usage_id)!;
    expect(usage).toMatchObject({ garden_id: a.id, quantity: 4, used_on: '2026-10-16' });

    // Đổi số lượng: lần dùng vật tư đổi theo; vượt tồn kho thì báo lỗi
    await ledger.updateFarmLog(log.id, { quantity: 6 });
    expect(ledger.getSnapshot().supply_usages.find((u) => u.id === log.supply_usage_id)!.quantity).toBe(6);
    await expect(ledger.updateFarmLog(log.id, { quantity: 11 })).rejects.toThrow('Trong kho chỉ còn 10 gói.');

    const undo = await ledger.removeFarmLog(log.id);
    expect(ledger.getSnapshot().farm_logs).toHaveLength(0);
    expect(ledger.getSnapshot().supply_usages).toHaveLength(0);
    await undo();
    expect(ledger.getSnapshot().farm_logs).toHaveLength(1);
    expect(ledger.getSnapshot().supply_usages).toHaveLength(1);
    // Tiền thuốc đã chuyển sang vườn
    expect(totals(allocatedEntries(ledger.getSnapshot()).filter((t) => t.garden_id === a.id)).expense).toBe(300_000);
  });

  it('cách ly: tính ngày được thu hoạch theo lần phun có cách ly dài nhất của đúng vườn đó', async () => {
    const { ledger, a, b } = await setup();
    await ledger.addFarmLog({ garden_id: a.id, date: '2026-10-10', kind: 'spray', title: 'Thuốc A', withholding_days: 7 });
    await ledger.addFarmLog({ garden_id: a.id, date: '2026-10-16', kind: 'spray', title: 'Thuốc B', withholding_days: 14 });
    // Bón phân không có cách ly
    await ledger.addFarmLog({ garden_id: a.id, date: '2026-10-20', kind: 'fertilize', title: 'NPK', withholding_days: 30 });
    await ledger.addFarmLog({ garden_id: b.id, date: '2026-10-21', kind: 'spray', title: 'Thuốc C', withholding_days: 21 });
    const logs = ledger.getSnapshot().farm_logs;

    expect(withholdingOn(logs, a.id, '2026-10-22')).toMatchObject({ safe_from: '2026-10-30', days_left: 8, log: { title: 'Thuốc B' } });
    expect(withholdingOn(logs, a.id, '2026-10-30')).toBeNull();
    // Phun sau ngày đang xét thì chưa tính
    expect(withholdingOn(logs, b.id, '2026-10-20')).toBeNull();
  });

  it('xuất nhật ký 1 vườn theo thứ tự ngày, xóa vườn thì xóa nhật ký', async () => {
    const { ledger, a } = await setup();
    await ledger.addFarmLog({ garden_id: a.id, date: '2026-10-16', kind: 'spray', title: 'Regent', quantity: 2, unit: 'gói', target: 'sâu đục thân', withholding_days: 14 });
    await ledger.addFarmLog({ garden_id: a.id, date: '2026-10-05', kind: 'fertilize', title: 'NPK 20-20-15', quantity: 50, unit: 'kg', worker: 'Anh Tư' });

    const text = farmLogText(a, ledger.getSnapshot().farm_logs, { from: '2026-10-01' });
    expect(text).toBe(
      [
        'NHẬT KÝ CANH TÁC: Vườn sầu riêng',
        'Cây trồng: Sầu riêng',
        'Diện tích: 10.000 m²',
        'Từ 01/10/2026 đến …',
        '',
        '1. 05/10/2026 · 🌱 Bón phân · NPK 20-20-15 50 kg · người làm: Anh Tư',
        '2. 16/10/2026 · 🧴 Phun thuốc · Regent 2 gói · trị sâu đục thân · cách ly 14 ngày',
      ].join('\n'),
    );

    await ledger.removeGarden(a.id);
    expect(ledger.getSnapshot().farm_logs).toHaveLength(0);
  });
});
