import { SyncEngine, type Ledger, type SyncStatus } from '@nhanong/shared'
import { useSyncExternalStore } from 'react'
import { api } from '../api'

let engine: SyncEngine | null = null

/**
 * Bộ đồng bộ dùng chung cho cả app (tạo 1 lần khi mở sổ).
 * Tự gửi sau mỗi lần ghi; đồng bộ lại khi có mạng trở lại hoặc khi quay lại tab.
 */
export function startSync(ledger: Ledger): SyncEngine {
  if (engine) return engine
  const sync = new SyncEngine(ledger, api)
  engine = sync
  sync.start()
  const again = () => {
    if (sync.enabled && document.visibilityState === 'visible') void sync.syncNow()
  }
  window.addEventListener('online', again)
  document.addEventListener('visibilitychange', again)
  return sync
}

export function getSync(): SyncEngine {
  if (!engine) throw new Error('Sổ chưa mở')
  return engine
}

const noop = () => () => {}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(engine?.subscribe ?? noop, () => engine?.getStatus() ?? 'off')
}

/** Tên máy hiện trong danh sách phiên đăng nhập trên server */
export function deviceName(): string {
  const ua = navigator.userAgent
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Máy tính'
  return `Web (${os})`
}
