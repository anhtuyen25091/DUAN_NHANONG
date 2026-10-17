import { useSyncExternalStore } from 'react'

/** Mặt hàng đang theo dõi (lưu trên máy), ghim lên đầu bảng giá */
const KEY = 'nhanong_followed'
const listeners = new Set<() => void>()

function read(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

let current = read()

export function toggleFollow(code: string) {
  current = current.includes(code) ? current.filter((c) => c !== code) : [...current, code]
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    // Không lưu được: vẫn dùng trong phiên này
  }
  listeners.forEach((l) => l())
}

export function useFollowed(): string[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
    () => current,
  )
}
