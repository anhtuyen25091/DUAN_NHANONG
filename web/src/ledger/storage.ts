import { LEDGER_TABLES, type LedgerMeta, type LedgerRecords, type LedgerStorage, type LedgerTable } from '@nhanong/shared'
import type { SyncRecord } from '@nhanong/shared'

const DB_NAME = 'nhanong-ledger'
const META_KEY = 'meta'

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('Không ghi được dữ liệu'))
  })
}

function openDb(): Promise<IDBDatabase> {
  // Thêm bảng mới thì tăng version (onupgradeneeded tạo bảng còn thiếu).
  // 2: mùa vụ, kho vật tư, công nợ; 3: bán cho lái; 4: khoản hay dùng, thu hoạch, nhân công, ô tự thêm; 5: nhật ký canh tác
  const req = indexedDB.open(DB_NAME, 5)
  req.onupgradeneeded = () => {
    const db = req.result
    for (const table of LEDGER_TABLES) if (!db.objectStoreNames.contains(table)) db.createObjectStore(table, { keyPath: 'id' })
    if (!db.objectStoreNames.contains(META_KEY)) db.createObjectStore(META_KEY)
  }
  return request(req)
}

/** Lưu sổ thu chi trong IndexedDB của trình duyệt (mỗi bảng một object store) */
export async function indexedDbStorage(): Promise<LedgerStorage> {
  const db = await openDb()
  const stores = [...LEDGER_TABLES, META_KEY]

  return {
    async load() {
      const tx = db.transaction(stores, 'readonly')
      const records: Partial<LedgerRecords> = {}
      for (const table of LEDGER_TABLES) records[table] = (await request(tx.objectStore(table).getAll())) as never
      const meta = ((await request(tx.objectStore(META_KEY).get(META_KEY))) ?? {}) as LedgerMeta
      return { records, meta }
    },
    async save(table: LedgerTable, records: SyncRecord[]) {
      const tx = db.transaction(table, 'readwrite')
      for (const record of records) tx.objectStore(table).put(record)
      await done(tx)
    },
    async saveMeta(meta: LedgerMeta) {
      const tx = db.transaction(META_KEY, 'readwrite')
      tx.objectStore(META_KEY).put(meta, META_KEY)
      await done(tx)
    },
    async clear() {
      const tx = db.transaction(stores, 'readwrite')
      for (const store of stores) tx.objectStore(store).clear()
      await done(tx)
    },
  }
}
