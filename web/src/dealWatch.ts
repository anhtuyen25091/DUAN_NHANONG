import { DealWatcher, type DealWatchState } from '@nhanong/shared'
import { useSyncExternalStore } from 'react'
import { api } from './api'
import { getAuth } from './auth'
import { realtimeConnected, startRealtime } from './realtime'

const SEEN_KEY = 'deal_seen'
const INTERVAL_MS = 8000
/** Đang nối Ably (cập nhật tức thì): chỉ cần hỏi lại thưa, phòng lỡ tin */
const REALTIME_INTERVAL_MS = 60_000

/**
 * Theo dõi đơn mua bán chung trên web: hỏi server 8 giây 1 lần khi tab đang mở (hỏi ngay khi quay lại tab;
 * có cập nhật tức thì qua Ably thì hỏi ngay khi có tin và chỉ hỏi định kỳ 60 giây / lần),
 * báo khi bên kia vừa ghi / xác nhận / báo sai. Tab đang ẩn và đã cho phép thì hiện thông báo của trình duyệt.
 */
export const dealWatcher = new DealWatcher(api, {
  getToken: () => getAuth()?.token ?? null,
  loadSeen: () => {
    try {
      return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}')
    } catch {
      return {}
    }
  },
  saveSeen: (seen) => {
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(seen))
    } catch {
      // Không lưu được: lần sau có thể báo lại 1 lần
    }
  },
})

let started = false
let lastToken: string | null = null

export function startDealWatch() {
  if (started) return
  started = true
  const tick = async () => {
    const token = getAuth()?.token ?? null
    if (token !== lastToken) {
      dealWatcher.reset()
      lastToken = token
    }
    if (!token || document.visibilityState !== 'visible') return
    const before = new Set(dealWatcher.getState().notices.map((n) => n.id))
    try {
      await dealWatcher.poll()
    } catch {
      return // Mất mạng: lần sau hỏi lại
    }
    for (const notice of dealWatcher.getState().notices) {
      if (before.has(notice.id) || document.hasFocus()) continue
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`Nhà Nông · ${notice.title}`, { body: notice.text, tag: notice.id })
      }
    }
  }
  // Hỏi định kỳ, nhịp tùy có cập nhật tức thì hay không; có tin Ably thì hỏi ngay
  let timer: ReturnType<typeof setTimeout> | undefined
  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(async () => {
      await tick()
      schedule()
    }, realtimeConnected() ? REALTIME_INTERVAL_MS : INTERVAL_MS)
  }
  const now = () => {
    void tick()
    schedule()
  }
  startRealtime(now, schedule)
  now()
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void tick())
}

export function useDealWatch(): DealWatchState {
  return useSyncExternalStore(dealWatcher.subscribe, dealWatcher.getState)
}
