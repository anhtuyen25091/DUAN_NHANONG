import { describe, expect, it } from 'vitest';
import { planFarmWorkSync, runFarmWorkSync, workStatusLines, type FarmWorkSyncStore } from './farmwork';
import type { IotApi, IotFarm, IotPlotEvent, IotPlotEventInput } from './iot';
import { Ledger, type LedgerMeta, type LedgerStorage } from './ledger';
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

let clock = new Date('2026-11-02T01:00:00Z').getTime();
const now = () => new Date((clock += 1000));

function event(patch: Partial<IotPlotEvent>): IotPlotEvent {
  return {
    id: 1,
    uuid: '11111111-1111-4111-8111-111111111111',
    plot_id: 7,
    kind: 'spray',
    kind_label: '🧴 Phun thuốc',
    title: 'Regent 800WG',
    quantity: 2,
    unit: 'gói',
    target: 'sâu đục trái',
    withholding_days: 14,
    reentry_hours: 24,
    rain_free_hours: 4,
    worker: null,
    note: null,
    planned: false,
    done_at: '2026-11-02T08:00:00+07:00',
    source: 'manual',
    actuator_id: null,
    minutes: null,
    user: { id: 3, name: 'Anh Tư' },
    no_entry_until: null,
    harvest_from: null,
    canopy_paused_until: null,
    deleted: false,
    updated_at: '2026-11-02T01:00:00Z',
    ...patch,
  };
}

/** Máy chủ cảm biến giả: lưu việc theo (lô, uuid), trả theo ?since= */
function fakeIot(farms: Partial<IotFarm>[]) {
  const rows = new Map<string, IotPlotEvent>();
  let id = 100;
  const api = {
    farms: async () => farms as IotFarm[],
    plotEvents: async (plotId: number, query: { since?: string } = {}) =>
      [...rows.values()].filter((e) => e.plot_id === plotId && (!query.since || (e.updated_at ?? '') >= query.since)),
    savePlotEvent: async (plotId: number, input: IotPlotEventInput) => {
      const key = `${plotId}|${input.uuid}`;
      const current = rows.get(key);
      // Giống máy chủ: sổ gửi lên không đè giờ cấm vào lô / chờ thuốc khô, cùng ngày thì giữ giờ làm
      if (current && input.source === 'ledger') {
        input = { ...input, reentry_hours: input.reentry_hours ?? current.reentry_hours, rain_free_hours: input.rain_free_hours ?? current.rain_free_hours };
        if (input.done_at && new Date(input.done_at).toISOString().slice(0, 10) === new Date(current.done_at).toISOString().slice(0, 10)) input = { ...input, done_at: current.done_at };
      }
      const next = event({ ...(current ?? {}), ...input, id: current?.id ?? ++id, plot_id: plotId, uuid: input.uuid!, user: null, source: (input.source ?? 'manual') as IotPlotEvent['source'], done_at: input.done_at ?? '2026-11-02T08:30:00+07:00', updated_at: now().toISOString() } as Partial<IotPlotEvent>);
      rows.set(key, next);
      return next;
    },
    deletePlotEventByUuid: async (plotId: number, uuid: string) => {
      const current = rows.get(`${plotId}|${uuid}`);
      if (current) rows.set(`${plotId}|${uuid}`, { ...current, deleted: true, updated_at: now().toISOString() });
    },
  };
  return { api: api as unknown as IotApi, rows, put: (e: IotPlotEvent) => rows.set(`${e.plot_id}|${e.uuid}`, e) };
}

function memoryStore(): FarmWorkSyncStore & { value: Record<number, string> } {
  const s = { value: {} as Record<number, string>, get: () => s.value, set: (v: Record<number, string>) => (s.value = v) };
  return s;
}

describe('Việc làm vườn: đồng bộ Sổ thu chi ↔ lô cảm biến', () => {
  it('việc người làm công ghi trên lô vào nhật ký vườn của chủ; nhật ký chủ ghi lên lô', async () => {
    const ledger = await Ledger.open(memoryStorage(), now);
    const garden = await ledger.addGarden({ name: 'Vườn sầu riêng' });
    const other = await ledger.addGarden({ name: 'Vườn cà phê' });
    const iot = fakeIot([
      { id: 1, role: 'owner', plots: [{ id: 7, farm_id: 1, name: 'Lô A', type: 'garden', type_label: 'Vườn', crop: null, area_m2: null, ledger_garden_id: garden.id }] },
      // Trang trại người khác chia sẻ: không đụng tới sổ của mình
      { id: 2, role: 'operator', plots: [{ id: 9, farm_id: 2, name: 'Lô B', type: 'garden', type_label: 'Vườn', crop: null, area_m2: null, ledger_garden_id: other.id }] },
    ]);
    iot.put(event({}));
    iot.put(event({ id: 2, uuid: '22222222-2222-4222-8222-222222222222', kind: 'water', title: 'Bơm giếng chạy 30 phút', source: 'actuator', user: null, withholding_days: null, quantity: null, unit: null, target: null }));
    iot.put(event({ id: 3, uuid: '33333333-3333-4333-8333-333333333333', planned: true, title: 'Ridomil' }));
    iot.put(event({ id: 4, uuid: '44444444-4444-4444-8444-444444444444', plot_id: 9, title: 'Không phải của mình' }));
    const mine = await ledger.addFarmLog({ garden_id: garden.id, date: '2026-10-25', kind: 'fertilize', title: 'NPK 20-20-15', quantity: 50, unit: 'kg' });
    const store = memoryStore();

    expect(await runFarmWorkSync(iot.api, ledger, store, new Date('2026-11-02T02:00:00Z'))).toBe(3);

    const logs = ledger.getSnapshot().farm_logs;
    const spray = logs.find((l) => l.id === '11111111-1111-4111-8111-111111111111')!;
    expect(spray).toMatchObject({ garden_id: garden.id, date: '2026-11-02', kind: 'spray', title: 'Regent 800WG', withholding_days: 14, worker: 'Anh Tư' });
    expect(logs.find((l) => l.title === 'Bơm giếng chạy 30 phút')).toMatchObject({ kind: 'water', worker: null });
    expect(logs.some((l) => l.title === 'Ridomil' || l.title === 'Không phải của mình')).toBe(false);
    expect(iot.rows.get(`7|${mine.id}`)).toMatchObject({ kind: 'fertilize', title: 'NPK 20-20-15', source: 'ledger', done_at: '2026-10-25T12:00:00+07:00' });
    expect(store.value[7]).toBe('2026-11-02T01:59:00.000Z');

    // Lượt sau không có gì mới: không gửi qua gửi lại
    expect(await runFarmWorkSync(iot.api, ledger, store, new Date('2026-11-02T02:05:00Z'))).toBe(0);
  });

  it('sửa / xóa ở bên nào thì bên kia theo', async () => {
    const ledger = await Ledger.open(memoryStorage(), now);
    const garden = await ledger.addGarden({ name: 'Vườn sầu riêng' });
    const iot = fakeIot([{ id: 1, role: 'owner', plots: [{ id: 7, farm_id: 1, name: 'Lô A', type: 'garden', type_label: 'Vườn', crop: null, area_m2: null, ledger_garden_id: garden.id }] }]);
    iot.put(event({}));
    const store = memoryStore();
    await runFarmWorkSync(iot.api, ledger, store, new Date('2026-11-02T02:00:00Z'));

    // Sửa liều trong sổ: lô cập nhật, giữ giờ cấm vào lô
    clock = Date.parse('2026-11-02T02:05:00Z');
    await ledger.updateFarmLog('11111111-1111-4111-8111-111111111111', { quantity: 3 });
    expect(await runFarmWorkSync(iot.api, ledger, store, new Date('2026-11-02T02:10:00Z'))).toBe(1);
    expect(iot.rows.get('7|11111111-1111-4111-8111-111111111111')).toMatchObject({ quantity: 3, reentry_hours: 24, done_at: '2026-11-02T08:00:00+07:00' });

    // Xóa trên lô: sổ xóa theo
    clock = Date.parse('2026-11-02T02:15:00Z');
    await iot.api.deletePlotEventByUuid(7, '11111111-1111-4111-8111-111111111111');
    expect(await runFarmWorkSync(iot.api, ledger, store, new Date('2026-11-02T02:20:00Z'))).toBe(1);
    expect(ledger.getSnapshot().farm_logs).toHaveLength(0);

    // Xóa trong sổ: lô xóa theo
    clock = Date.parse('2026-11-02T02:25:00Z');
    const log = await ledger.addFarmLog({ garden_id: garden.id, date: '2026-11-02', kind: 'water', title: 'Tưới gốc' });
    await runFarmWorkSync(iot.api, ledger, store, new Date('2026-11-02T02:30:00Z'));
    expect(iot.rows.get(`7|${log.id}`)?.deleted).toBe(false);
    clock = Date.parse('2026-11-02T02:35:00Z');
    await ledger.removeFarmLog(log.id);
    await runFarmWorkSync(iot.api, ledger, store, new Date('2026-11-02T02:40:00Z'));
    expect(iot.rows.get(`7|${log.id}`)?.deleted).toBe(true);
  });

  it('vườn nối 2 lô: nhật ký lên cả 2 lô, nhận về chỉ 1 nhật ký', () => {
    const log = { id: 'L1', garden_id: 'G', date: '2026-11-01', kind: 'spray', title: 'Anvil', quantity: null, unit: null, target: null, withholding_days: 7, supply_id: null, supply_usage_id: null, worker: null, note: null, updated_at: '2026-11-01T05:00:00Z', deleted_at: null } as const;
    const plan = planFarmWorkSync({
      links: [
        { plot_id: 1, garden_id: 'G' },
        { plot_id: 2, garden_id: 'G' },
      ],
      events: { 1: [event({ uuid: 'E1', plot_id: 1 })], 2: [event({ uuid: 'E1', plot_id: 2 })] },
      logs: [log],
      lastSync: { 1: '2026-10-31T00:00:00Z', 2: '2026-10-31T00:00:00Z' },
      now: new Date('2026-11-02T02:00:00Z'),
    });
    expect(plan.upsertLogs.map((u) => u.id)).toEqual(['E1']);
    expect(plan.pushEvents.map((p) => [p.plot_id, p.input.uuid])).toEqual([
      [1, 'L1'],
      [2, 'L1'],
    ]);
  });

  it('dòng cảnh báo trên trang lô', () => {
    const lines = workStatusLines(
      {
        no_entry_until: '2026-11-03T08:00:00+07:00',
        no_entry_event: { id: 1, uuid: 'x', kind: 'spray', title: 'Regent', done_at: '2026-11-02T08:00:00+07:00' },
        harvest_from: '2026-11-16',
        harvest_event: { id: 1, uuid: 'x', kind: 'spray', title: 'Regent', done_at: '2026-11-02T08:00:00+07:00' },
        canopy_paused_until: '2026-11-02T12:00:00+07:00',
        spray_event: null,
        fertilized_at: '2026-11-01T07:00:00+07:00',
        fertilize_event: { id: 2, uuid: 'y', kind: 'fertilize', title: 'NPK', done_at: '2026-11-01T07:00:00+07:00' },
        planned: 0,
      },
      new Date('2026-11-02T02:00:00Z'),
    ).map((l) => l.text);
    expect(lines).toEqual([
      '⛔ Không vào lô tới 08:00 03/11 (vừa phun Regent)',
      '🚫 Chưa thu hoạch: cách ly tới hết ngày 15/11/2026, thu hoạch từ 16/11/2026 (Regent)',
      '💧 Tạm dừng tưới trên tán tới 12:00 02/11 cho thuốc khô',
      '🌱 Vừa bón NPK ngày 01/11: EC, đạm, lân, kali có thể tăng vài ngày',
    ]);
  });
});
