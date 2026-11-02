import { ApiError, createIotApi, type IotAuth } from '@nhanong/shared'
import { useSyncExternalStore } from 'react'
import { getAuth, subscribeAuth } from './auth'

/**
 * Cảm biến ruộng / ao: máy chủ riêng (dự án iot/), đăng nhập bằng tài khoản Nhà Nông (tự lấy token cảm biến).
 * Tài khoản cảm biến cũ (email) vẫn đăng nhập được khi chưa đăng nhập Nhà Nông.
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

/** Đọc ngoài React (VD đồng bộ việc làm vườn) */
export function readIotAuth(): IotAuth | null {
  return current
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

let syncedToken: string | null = null
let syncing: Promise<void> | null = null

/**
 * Cho mục Cảm biến theo tài khoản Nhà Nông đang đăng nhập:
 * - chưa vào Cảm biến, hoặc đang vào bằng tài khoản Nhà Nông khác: đăng nhập lại bằng token Nhà Nông
 * - đang dùng tài khoản email cũ chưa nối: nối với tài khoản Nhà Nông (giữ trang trại cũ)
 * - đăng xuất Nhà Nông: thoát luôn Cảm biến (trừ tài khoản email chưa nối)
 * Lỗi (mất mạng, máy chủ cảm biến tắt) thì ném ra để trang hiện nút thử lại.
 */
export function syncIotWithNhanong(): Promise<void> {
  syncing ??= run().finally(() => {
    syncing = null
  })
  return syncing
}

async function run(): Promise<void> {
  const nhanong = getAuth()
  if (!nhanong) {
    syncedToken = null
    if (current?.user.nhanong_user_id) await signOutIot()
    return
  }
  if (nhanong.token === syncedToken && current) return
  if (current && current.user.nhanong_user_id == null) {
    try {
      await iotApi.linkNhanong(nhanong.token)
      setIotAuth({ ...current, user: { ...current.user, nhanong_user_id: nhanong.user.id } })
    } catch (err) {
      // Tài khoản Nhà Nông đã nối với tài khoản cảm biến khác: theo tài khoản Nhà Nông
      if (!(err instanceof ApiError) || err.status !== 422) throw err
      setIotAuth(await iotApi.loginNhanong(nhanong.token))
    }
  } else if (current && current.user.nhanong_user_id === nhanong.user.id) {
    // Cùng người: gửi token mới để máy chủ cảm biến biết gói đang dùng
    await iotApi.linkNhanong(nhanong.token)
  } else {
    setIotAuth(await iotApi.loginNhanong(nhanong.token))
  }
  syncedToken = nhanong.token
}

subscribeAuth(() => {
  void syncIotWithNhanong().catch(() => {})
})

/**
 * Bật / tắt máy. Lô vừa phun thuốc mà bật máy tưới trên tán thì máy chủ trả 409 (kèm lý do): hỏi lại, đồng ý thì gửi kèm force.
 * Trả null khi người dùng không bật nữa.
 */
export async function sendIotCommand(actuatorId: number, action: 'on' | 'off', minutes?: number) {
  try {
    return await iotApi.command(actuatorId, action, minutes)
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 409 || action !== 'on') throw err
    if (!window.confirm(`${err.message}\n\nVẫn bật?`)) return null
    return iotApi.command(actuatorId, action, minutes, true)
  }
}
