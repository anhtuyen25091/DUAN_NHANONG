import { PurchaseOutbox, type OutboxState } from '@nhanong/shared'
import { useSyncExternalStore } from 'react'
import { api } from './api'
import { getAuth } from './auth'
import { showToast } from './ledger/toast'

const KEY = 'purchase_outbox'
const INTERVAL_MS = 30_000

/**
 * Phiếu lập lúc mất mạng: lưu trong trình duyệt, tự gửi khi có mạng lại (sự kiện online, quay lại tab, 30 giây / lần).
 */
export const purchaseOutbox = new PurchaseOutbox(api, {
  getAuth,
  load: () => localStorage.getItem(KEY),
  save: (value) => localStorage.setItem(KEY, value),
})

/** Gửi các phiếu chờ; gửi được thì báo */
export async function flushOutbox(retryFailed = false) {
  const sent = await purchaseOutbox.flush(retryFailed)
  if (sent.length > 0) showToast({ message: `Đã gửi ${sent.length} phiếu lập lúc mất mạng (${sent.map((p) => p.code).join(', ')})` })
  return sent
}

let started = false

export function startPurchaseOutbox() {
  if (started) return
  started = true
  const tick = () => {
    if (navigator.onLine && document.visibilityState === 'visible') void flushOutbox()
  }
  tick()
  setInterval(tick, INTERVAL_MS)
  window.addEventListener('online', tick)
  document.addEventListener('visibilitychange', tick)
}

export function useOutbox(): OutboxState {
  return useSyncExternalStore(purchaseOutbox.subscribe, purchaseOutbox.getState)
}
