import type { AccountUser, AuthResult } from '@nhanong/shared'
import { useSyncExternalStore } from 'react'

/**
 * Tài khoản đang đăng nhập trên trình duyệt (để xem lịch sử giá dài hơn).
 * Độc lập với "lưu cả trên mạng" của sổ thu chi, nhưng khi đăng nhập ở sổ thì cũng lưu vào đây.
 */
const KEY = 'auth'

/** shared: token dùng chung với "lưu cả trên mạng" của sổ thu chi (đăng xuất ở đây không hủy token trên server) */
export type StoredAuth = AuthResult & { shared?: boolean }

let current: StoredAuth | null = read()
const listeners = new Set<() => void>()

function read(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as StoredAuth) : null
  } catch {
    return null
  }
}

export function setAuth(auth: StoredAuth | null) {
  current = auth
  try {
    if (auth) localStorage.setItem(KEY, JSON.stringify(auth))
    else localStorage.removeItem(KEY)
  } catch {
    // Trình duyệt chặn lưu trữ: vẫn dùng được trong phiên này
  }
  listeners.forEach((l) => l())
}

/** Cập nhật thông tin tài khoản (mức xem, hạn gói) mà không đổi token */
export function updateAuthUser(user: AccountUser) {
  if (current) setAuth({ ...current, user })
}

export function getAuth(): StoredAuth | null {
  return current
}

export function useAuth(): StoredAuth | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
}
