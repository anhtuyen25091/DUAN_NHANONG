import { ApiError, runFarmWorkSync, type FarmWorkSyncStore, type IotWorkKind } from '@nhanong/shared'
import { useSyncExternalStore } from 'react'
import { iotApi, readIotAuth } from './iot'
import { openLedger } from './ledger/useLedger'

/**
 * Việc làm vườn: đồng bộ 2 chiều Nhật ký canh tác (Sổ thu chi trên máy này) ↔ việc trên lô cảm biến.
 * Gọi khi mở mục Cảm biến / trang lô / Nhật ký canh tác, sau khi ghi / xóa việc, sau khi nối lô với vườn.
 * Mỗi lần chạy 1 lượt (gọi chồng thì dùng chung), cách nhau ít nhất 30 giây trừ khi force. Lỗi thì bỏ qua.
 */
const MIN_GAP_MS = 30_000

let running: Promise<number> | null = null
let rerun = false
let lastRun = 0
let version = 0
const listeners = new Set<() => void>()

function storeFor(userId: number): FarmWorkSyncStore {
  const key = `iot_farmwork_sync:${userId}`
  return {
    get() {
      try {
        const raw = localStorage.getItem(key)
        return raw ? (JSON.parse(raw) as Record<number, string>) : {}
      } catch {
        return {}
      }
    },
    set(value) {
      try {
        localStorage.setItem(key, JSON.stringify(value))
      } catch {
        // Trình duyệt chặn lưu trữ: lần sau đồng bộ lại từ đầu (không tạo trùng vì cùng uuid)
      }
    },
  }
}

async function runOnce(): Promise<number> {
  const auth = readIotAuth()
  if (!auth) return 0
  const ledger = await openLedger()
  // Chưa chọn nơi lưu sổ = chưa dùng Sổ thu chi trên máy này
  if (!ledger.getSnapshot().meta.storage_mode) return 0
  lastRun = Date.now()
  const changes = await runFarmWorkSync(iotApi, ledger, storeFor(auth.user.id))
  if (changes > 0) {
    version++
    listeners.forEach((l) => l())
  }
  return changes
}

export function syncFarmWork(force = false): Promise<number> {
  if (running) {
    // Đang chạy mà vừa có thay đổi: chạy thêm 1 lượt sau đó
    if (force) rerun = true
    return running
  }
  if (!force && Date.now() - lastRun < MIN_GAP_MS) return Promise.resolve(0)
  running = runOnce()
    .catch((err: unknown) => {
      if (!(err instanceof ApiError && err.status === 401)) console.warn('Đồng bộ việc làm vườn lỗi', err)
      return 0
    })
    .finally(() => {
      running = null
      if (rerun) {
        rerun = false
        void syncFarmWork(true)
      }
    })
  return running
}

/** Tăng mỗi khi đồng bộ thay đổi gì đó: thêm vào deps của useAsync để tải lại danh sách */
export function useFarmWorkVersion(): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => version,
  )
}

export const WORK_ICONS: Record<IotWorkKind, string> = { spray: '🧴', fertilize: '🌱', water: '💧', prune: '✂️', other: '📝' }

/** "14:30 03/11" theo giờ máy */
export function shortTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
}

/**
 * Giờ gửi máy chủ cảm biến dạng "2026-11-02T14:30:00+07:00" (giờ Việt Nam).
 * Máy chủ lưu giờ theo múi Việt Nam: gửi dạng "...Z" (UTC) bị lệch 7 tiếng.
 */
export function vnIso(date: Date): string {
  return `${new Date(date.getTime() + 7 * 3600_000).toISOString().slice(0, 19)}+07:00`
}
