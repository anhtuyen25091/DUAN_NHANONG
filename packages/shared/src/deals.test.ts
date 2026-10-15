import { describe, expect, it } from 'vitest';
import type { Deal, DealEntry } from './api';
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

const entry = (patch: Partial<DealEntry>): DealEntry => ({
  uuid: crypto.randomUUID(),
  kind: 'cut',
  date: '2026-08-20',
  lines: [{ grade: 'Loại A', kg: 1000, price: 80000 }],
  amount: 80_000_000,
  kg: 1000,
  deposit_deduct: 0,
  paid: 0,
  note: null,
  status: 'confirmed',
  mine: false,
  created_by_name: 'Lái Tư',
  dispute_reason: null,
  responded_at: null,
  updated_at: '2026-08-20T10:00:00Z',
  ...patch,
});

const deal = (role: Deal['my_role'], entries: DealEntry[]): Deal =>
  ({ uuid: '11111111-1111-4111-8111-111111111111', title: 'Sầu riêng Ri6', unit: 'kg', my_role: role, entries }) as Deal;

describe('Đơn mua bán chung → Sổ thu chi', () => {
  it('nông dân (bên bán): đợt cân đã xác nhận thành tiền vào của vườn; cọc, trả tiền, mục chờ xác nhận thì không', async () => {
    const ledger = await Ledger.open(memoryStorage(), now);
    const garden = await ledger.addGarden({ name: 'Vườn sầu riêng' });
    const banNongSan = ledger.getSnapshot().categories.find((c) => c.name === 'Bán nông sản')!.id;
    const cut1 = entry({});
    const entries = [entry({ kind: 'deposit', amount: 100_000_000, lines: null }), cut1, entry({ status: 'pending', amount: 50_000_000 }), entry({ kind: 'payment', amount: 20_000_000, lines: null })];

    // Chưa nối thì không ghi gì
    expect(await ledger.applyDeal(deal('seller', entries))).toBe(0);

    await ledger.linkDeal(deal('seller', []).uuid, { garden_id: garden.id, category_id: banNongSan });
    expect(await ledger.applyDeal(deal('seller', entries))).toBe(1);
    const tx = ledger.getSnapshot().transactions;
    expect(tx).toHaveLength(1);
    expect(tx[0]).toMatchObject({ id: cut1.uuid, type: 'income', amount: 80_000_000, garden_id: garden.id, note: 'Đơn "Sầu riêng Ri6": 1000 kg' });

    // Chạy lại không trùng; khoản tự ghi không xóa được ở sổ
    expect(await ledger.applyDeal(deal('seller', entries))).toBe(0);
    await expect(ledger.removeEntry(cut1.uuid)).rejects.toThrow('đơn mua bán chung');
  });

  it('đợt cân bị sửa (chờ xác nhận lại) thì gỡ khoản; xác nhận lại thì ghi lại số mới; bỏ nối thì gỡ hết', async () => {
    const ledger = await Ledger.open(memoryStorage(), now);
    const category = await ledger.ensureCategory('expense', 'Mua nông sản', '🧺');
    expect(await ledger.ensureCategory('expense', 'Mua nông sản', '🧺')).toBe(category);
    const d = deal('buyer', []);
    await ledger.linkDeal(d.uuid, { garden_id: null, category_id: category });

    const cut = entry({ mine: true });
    const cost = entry({ kind: 'cost', amount: 2_000_000, status: 'private', mine: true, lines: null, note: 'Xe tải' });
    await ledger.applyDeal(deal('buyer', [cut, cost]));
    expect(totals(ledger.getSnapshot().transactions)).toEqual({ income: 0, expense: 82_000_000, profit: -82_000_000 });

    await ledger.applyDeal(deal('buyer', [{ ...cut, status: 'pending', amount: 85_000_000 }, cost]));
    expect(totals(ledger.getSnapshot().transactions).expense).toBe(2_000_000);

    await ledger.applyDeal(deal('buyer', [{ ...cut, amount: 85_000_000 }, cost]));
    expect(filterEntries(ledger.getSnapshot().transactions, { gardenId: null }).map((t) => t.amount).sort()).toEqual([2_000_000, 85_000_000]);

    await ledger.linkDeal(d.uuid, null);
    expect(ledger.getSnapshot().transactions).toHaveLength(0);
    expect(ledger.getSnapshot().meta.deal_links).toEqual({});
  });
});
