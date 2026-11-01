import { createIotApi, type IotAuth } from '@nhanong/shared'
import { useSyncExternalStore } from 'react'
import { getAuth } from './auth'

/**
 * Cảm biến ruộng / ao: máy chủ riêng (dự án iot/), tài khoản riêng (email).
 * Dev: gọi qua proxy Vite "/iot" (cổng 8001); chạy thật đặt VITE_IOT_URL.
 */
const KEY = 'iot_auth'

let current: IotAuth | null = read()
const listeners = new Set<() => void>()

function read(): IotAuth | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as IotAuth) : null
  } catch {
    return null
  }
}

export const iotApi = createIotApi({ baseUrl: import.meta.env.VITE_IOT_URL ?? '/iot', getToken: () => current?.token ?? null })

export function setIotAuth(auth: IotAuth | null) {
  current = auth
  try {
    if (auth) localStorage.setItem(KEY, JSON.stringify(auth))
    else localStorage.removeItem(KEY)
  } catch {
    // Trình duyệt chặn lưu trữ: vẫn dùng được trong phiên này
  }
  listeners.forEach((l) => l())
}

export function useIotAuth(): IotAuth | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => current,
  )
}

export async function signOutIot() {
  await iotApi.logout().catch(() => {})
  setIotAuth(null)
}

let linkedToken: string | null = null

/** Đã đăng nhập cả tài khoản Nhà Nông: nối để dùng chung gói (xem lượng mưa 1 năm) */
export async function linkNhanongIfPossible(): Promise<void> {
  const token = getAuth()?.token ?? null
  if (!current || !token || token === linkedToken) return
  linkedToken = token
  await iotApi.linkNhanong(token).catch(() => {
    linkedToken = null
  })
}
