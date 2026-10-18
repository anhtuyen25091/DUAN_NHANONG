import { LEDGER_TABLES, Ledger, type LedgerMeta, type LedgerRecords, type LedgerSnapshot, type LedgerStorage, type SyncRecord } from '@nhanong/shared';
import { openDatabaseAsync } from 'expo-sqlite';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { prunePhotos } from './receipts';
import { startDueReminders } from './reminders';
import { startSync } from './sync';

/**
 * Sổ thu chi lưu trong SQLite trên máy: 1 bảng `records` (tbl, id, data JSON) + 1 bảng `meta`.
 * Lưu dạng JSON để thêm trường mới không phải đổi cấu trúc bảng.
 */
async function sqliteStorage(): Promise<LedgerStorage> {
  const db = await openDatabaseAsync('ledger.db');
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS records (tbl TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (tbl, id));
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
  `);

  return {
    async load() {
      const rows = await db.getAllAsync<{ tbl: string; data: string }>('SELECT tbl, data FROM records');
      const records: Partial<Record<string, SyncRecord[]>> = {};
      for (const row of rows) (records[row.tbl] ??= []).push(JSON.parse(row.data));
      const meta = await db.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = 'meta'");
      return { records: records as Partial<LedgerRecords>, meta: meta ? (JSON.parse(meta.value) as LedgerMeta) : {} };
    },
    async save(table, records) {
      await db.withTransactionAsync(async () => {
        for (const record of records) {
          await db.runAsync('INSERT OR REPLACE INTO records (tbl, id, data) VALUES (?, ?, ?)', table, record.id, JSON.stringify(record));
        }
      });
    },
    async saveMeta(meta) {
      await db.runAsync("INSERT OR REPLACE INTO meta (key, value) VALUES ('meta', ?)", JSON.stringify(meta));
    },
    async clear() {
      await db.execAsync('DELETE FROM records; DELETE FROM meta;');
    },
  };
}

/** Bản xem trước trên trình duyệt (expo start --web): lưu vào localStorage */
function browserStorage(): LedgerStorage {
  const KEY = 'nhanong-ledger';
  const read = (): { records: Partial<LedgerRecords>; meta: LedgerMeta } => {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? '') ?? { records: {}, meta: {} };
    } catch {
      return { records: {}, meta: {} };
    }
  };
  const write = (value: ReturnType<typeof read>) => localStorage.setItem(KEY, JSON.stringify(value));
  return {
    load: async () => read(),
    async save(table, records) {
      const value = read();
      const map = new Map((value.records[table] ?? []).map((r) => [r.id, r as SyncRecord]));
      for (const r of records) map.set(r.id, r);
      value.records[table] = [...map.values()] as never;
      write(value);
    },
    async saveMeta(meta) {
      write({ ...read(), meta });
    },
    async clear() {
      write({ records: Object.fromEntries(LEDGER_TABLES.map((t) => [t, []])), meta: {} });
    },
  };
}

let opening: Promise<Ledger> | null = null;

export function openLedger(): Promise<Ledger> {
  opening ??= (Platform.OS === 'web' ? Promise.resolve(browserStorage()) : sqliteStorage())
    .then((storage) => Ledger.open(storage))
    .then((ledger) => {
      // Chỉ chạy khi người dùng bật "lưu cả trên mạng"
      startSync(ledger);
      // Thông báo nhắc hạn trả nợ (chỉ khi người dùng đã bật trong Cài đặt sổ)
      startDueReminders(ledger);
      // Dọn ảnh hóa đơn thừa (cả khi chỉ lưu trên máy)
      try {
        prunePhotos(ledger);
      } catch {
        // Không dọn được thì lần sau
      }
      return ledger;
    });
  return opening;
}

const noop = () => () => {};

export function useLedger(): { ledger: Ledger; data: LedgerSnapshot } | { ledger: null; error: Error | null } {
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    openLedger().then(setLedger, setError);
  }, []);

  const data = useSyncExternalStore(ledger?.subscribe ?? noop, () => ledger?.getSnapshot() ?? null);
  return ledger && data ? { ledger, data } : { ledger: null, error };
}
