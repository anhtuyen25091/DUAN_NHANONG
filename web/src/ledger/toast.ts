import { useSyncExternalStore } from 'react'

export interface Toast {
  message: string
  undo?: () => void
}

let current: Toast | null = null
let timer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()

/** Thông báo ngắn ở cuối màn hình, có nút "Hoàn tác" trong 6 giây */
export function showToast(toast: Toast) {
  current = toast
  clearTimeout(timer)
  timer = setTimeout(() => setToast(null), 6000)
  listeners.forEach((l) => l())
}

function setToast(toast: Toast | null) {
  current = toast
  listeners.forEach((l) => l())
}

export function hideToast() {
  clearTimeout(timer)
  setToast(null)
}

export function useToast(): Toast | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
}
