import { describe, expect, it } from 'vitest';
import { ApiError, type SyncPullResult, type SyncPushRecord } from './api';
import { Ledger, type LedgerMeta, type LedgerStorage } from './ledger';
import { previousAccount, SyncEngine } from './sync';
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
      meta = structuredClone(m);
    },
    clear: async () => {
      for (const k of Object.keys(tables)) delete tables[k];
      meta = {};
    },
  };
}

/** Server giả, làm giống LedgerSyncController: bản updated_at mới hơn thắng, version tăng dần */
function fakeServer() {
  const rows = new Map<string, { tbl: string; data: SyncPushRecord['data']; version: number }>();
  let version = 0;
  let online = true;
  const calls = { push: 0 };
  const guard = (token: string) => {
    if (!online) throw new ApiError('Không kết nối được', 0);
    if (token !== 'tok') throw new ApiError('Unauthenticated', 401);
  };
  const loggedOut: string[] = [];
  const api = {
    async syncPush(token: string, records: SyncPushRecord[]) {
      guard(token);
      calls.push++;
      let accepted = 0;
      for (const r of records) {
        const key = `${r.tbl}:${r.data.id}`;
        const existing = rows.get(key);
        if (existing && existing.data.updated_at >= r.data.updated_at) continue;
        rows.set(key, { tbl: r.tbl, data: structuredClone(r.data), version: ++version });
        accepted++;
      }
      return { accepted, version };
    },
    async syncPull(token: string, since: number): Promise<SyncPullResult> {
      guard(token);
      const page = [...rows.values()].filter((r) => r.version > since).sort((a, b) => a.version - b.version);
      const records: SyncPullResult['records'] = {};
      for (const r of page) (records[r.tbl] ??= []).push(structuredClone(r.data));
      return { records, version: page.at(-1)?.version ?? since, has_more: false };
    },
    async deleteServerLedger(token: string) {
      guard(token);
      rows.clear();
    },
    async logout(token: string) {
      loggedOut.push(token);
    },
  };
  return { api, rows, calls, loggedOut, setOnline: (v: boolean) => (online = v) };
}

const user = { id: 1, name: 'Anh Ba', phone: '0912345678' };

async function device(server: ReturnType<typeof fakeServer>) {
  const ledger = await Ledger.open(memoryStorage());
  return { ledger, sync: new SyncEngine(ledger, server.api, { debounceMs: 0 }) };
}

describe('SyncEngine', () => {
  it('bật đồng bộ: gửi cả sổ lên; máy thứ 2 đăng nhập thì nhận được, không trùng hạng mục', async () => {
    const server = fakeServer();
    const a = await device(server);
    await a.ledger.createSampleGarden();
    await a.sync.enable('tok', user);
    expect(a.sync.getStatus()).toBe('saved');

    const b = await device(server);
    await b.sync.enable('tok', user);

    expect(b.ledger.getSnapshot().gardens.map((g) => g.name)).toEqual(['Vườn mẫu (bấm thử)']);
    expect(b.ledger.getSnapshot().transactions).toHaveLength(4);
    // Hạng mục của 2 máy: không bị trùng tên (xem dedupe trong Ledger.merge)
    const names = b.ledger.getSnapshot().categories.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('sửa trên máy A, máy B đồng bộ thì thấy; xóa cũng truyền sang', async () => {
    const server = fakeServer();
    const a = await device(server);
    const b = await device(server);
    await a.sync.enable('tok', user);
    await b.sync.enable('tok', user);

    const cat = a.ledger.getSnapshot().categories[0];
    const entry = await a.ledger.addEntry({ type: 'expense', amount: 350000, category_id: cat.id, garden_id: null });
    await a.sync.syncNow();
    await b.sync.syncNow();
    expect(b.ledger.getSnapshot().transactions.map((t) => t.amount)).toEqual([350000]);

    await a.ledger.removeEntry(entry.id);
    await a.sync.syncNow();
    await b.sync.syncNow();
    expect(b.ledger.getSnapshot().transactions).toHaveLength(0);
  });

  it('mất mạng: báo offline, có mạng lại thì gửi bù', async () => {
    const server = fakeServer();
    const a = await device(server);
    await a.sync.enable('tok', user);

    server.setOnline(false);
    const cat = a.ledger.getSnapshot().categories[0];
    await a.ledger.addEntry({ type: 'income', amount: 9_000_000, category_id: cat.id, garden_id: null });
    await a.sync.syncNow();
    expect(a.sync.getStatus()).toBe('offline');
    expect(a.sync.hasPending()).toBe(true);

    server.setOnline(true);
    await a.sync.syncNow();
    expect(a.sync.getStatus()).toBe('saved');
    expect(a.sync.hasPending()).toBe(false);
    expect([...server.rows.values()].some((r) => r.data.amount === 9_000_000)).toBe(true);
  });

  it('lần sau chỉ gửi phần đã đổi', async () => {
    const server = fakeServer();
    const a = await device(server);
    await a.ledger.createSampleGarden();
    await a.sync.enable('tok', user);
    const before = server.rows.size;

    const cat = a.ledger.getSnapshot().categories[0];
    await a.ledger.addEntry({ type: 'expense', amount: 1000, category_id: cat.id, garden_id: null });
    expect(a.ledger.changedSince(a.ledger.getSnapshot().meta.last_pushed_at)).toHaveLength(1);
    await a.sync.syncNow();
    expect(server.rows.size).toBe(before + 1);
  });

  it('ghi đúng lúc đang đồng bộ: vẫn được gửi ngay sau đó', async () => {
    const server = fakeServer();
    const a = await device(server);
    await a.sync.enable('tok', user);
    a.sync.start();

    const cat = a.ledger.getSnapshot().categories[0];
    const running = a.sync.syncNow();
    await a.ledger.addEntry({ type: 'expense', amount: 7000, category_id: cat.id, garden_id: null });
    await running;
    await new Promise((r) => setTimeout(r, 20));

    expect([...server.rows.values()].some((r) => r.data.amount === 7000)).toBe(true);
    a.sync.stop();
  });

  it('phiên đăng nhập hết hạn: báo cần đăng nhập lại', async () => {
    const server = fakeServer();
    const a = await device(server);
    await a.ledger.setMeta({ storage_mode: 'sync', account: { token: 'het-han', name: 'x', phone: null } });
    await a.sync.syncNow();
    expect(a.sync.getStatus()).toBe('expired');
  });

  it('về chỉ lưu trên máy + xóa trên mạng: server trống, máy vẫn giữ sổ', async () => {
    const server = fakeServer();
    const a = await device(server);
    await a.ledger.createSampleGarden();
    await a.sync.enable('tok', user);

    await a.sync.disable(true);

    expect(server.rows.size).toBe(0);
    expect(a.ledger.getSnapshot().gardens).toHaveLength(1);
    expect(a.ledger.getSnapshot().meta).toMatchObject({ storage_mode: 'local' });
    expect(a.ledger.getSnapshot().meta.account).toBeUndefined();
    expect(a.sync.getStatus()).toBe('off');
  });

  it('tắt đồng bộ: hủy token trên server, trừ khi token còn dùng để xem giá (keepToken)', async () => {
    const server = fakeServer();
    const a = await device(server);
    await a.sync.enable('tok-1', user);
    await a.sync.disable(false, { keepToken: true });
    expect(server.loggedOut).toEqual([]);

    await a.sync.enable('tok-2', user);
    await a.sync.disable(false);
    expect(server.loggedOut).toEqual(['tok-2']);
  });

  it('tự gửi sau khi ghi (start)', async () => {
    const server = fakeServer();
    const a = await device(server);
    await a.sync.enable('tok', user);
    a.sync.start();
    await new Promise((r) => setTimeout(r, 10));
    const pushes = server.calls.push;

    const cat = a.ledger.getSnapshot().categories[0];
    await a.ledger.addEntry({ type: 'expense', amount: 5000, category_id: cat.id, garden_id: null });
    await new Promise((r) => setTimeout(r, 30));

    expect(server.calls.push).toBeGreaterThan(pushes);
    expect(a.sync.hasPending()).toBe(false);
    expect([...server.rows.values()].some((r) => r.data.amount === 5000)).toBe(true);
    a.sync.stop();
  });

  it('mất mạng: tự thử lại, có mạng lại là tự gửi (không cần bấm)', async () => {
    const server = fakeServer();
    const ledger = await Ledger.open(memoryStorage());
    const sync = new SyncEngine(ledger, server.api, { debounceMs: 0, retryMs: [5, 5] });
    await sync.enable('tok', user);
    server.setOnline(false);
    const cat = ledger.getSnapshot().categories[0];
    await ledger.addEntry({ type: 'income', amount: 7_000, category_id: cat.id, garden_id: null });
    await sync.syncNow();
    expect(sync.getStatus()).toBe('offline');

    server.setOnline(true);
    await new Promise((r) => setTimeout(r, 40));
    expect(sync.getStatus()).toBe('saved');
    expect(sync.hasPending()).toBe(false);
    sync.stop();
  });

  it('đăng nhập tài khoản khác trên máy đang có sổ: hỏi lại; bỏ sổ trên máy thì chỉ còn sổ của tài khoản mới', async () => {
    const server = fakeServer();
    const a = await device(server);
    await a.sync.enable('tok', user);
    const cat = a.ledger.getSnapshot().categories[0];
    await a.ledger.addEntry({ type: 'income', amount: 1_000, category_id: cat.id, garden_id: null });
    await a.sync.disable(false);

    const other = { id: 2, name: 'Chị Tư', phone: '0987654321' };
    // Đã tắt lưu trên mạng vẫn nhớ sổ này của ai
    expect(previousAccount(a.ledger.getSnapshot(), other)).toBe(user.phone);
    expect(previousAccount(a.ledger.getSnapshot(), user)).toBeNull();

    // Sổ trống thì không cần hỏi
    const b = await device(server);
    expect(previousAccount(b.ledger.getSnapshot(), other)).toBeNull();

    server.rows.clear();
    await a.sync.enable('tok', other, { discardLocal: true });
    expect(a.ledger.getSnapshot().transactions).toHaveLength(0);
    expect(a.ledger.getSnapshot().meta.linked_phone).toBe(other.phone);
    expect(a.ledger.getSnapshot().categories.length).toBeGreaterThan(0);
  });
});
