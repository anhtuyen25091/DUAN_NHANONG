import { useEffect, useState, useSyncExternalStore } from 'react'

export type AsyncState<T> = { status: 'loading' } | { status: 'error'; error: Error } | { status: 'ok'; data: T }

/** Gọi hàm async mỗi khi deps đổi; bỏ kết quả của lần gọi cũ. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): [AsyncState<T>, () => void] {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })
    load().then(
      (data) => active && setState({ status: 'ok', data }),
      (error: Error) => active && setState({ status: 'error', error }),
    )
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt])

  return [state, () => setAttempt((n) => n + 1)]
}

function subscribeHash(callback: () => void) {
  window.addEventListener('hashchange', callback)
  return () => window.removeEventListener('hashchange', callback)
}

/** Router đơn giản theo hash: "#/san-pham/ho-tieu?region=dak-lak" -> { path: ['san-pham','ho-tieu'], query } */
export function useRoute(): { path: string[]; query: URLSearchParams } {
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash)
  const [path, qs = ''] = hash.replace(/^#\/?/, '').split('?')
  return { path: path.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(qs) }
}

export function href(path: string, query: Record<string, string | null | undefined> = {}): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value)
  const qs = params.toString()
  return `#/${path}${qs ? `?${qs}` : ''}`
}

/** Đổi query trên hash mà không thêm vào lịch sử (dùng cho bộ lọc) */
export function replaceQuery(path: string, query: Record<string, string | null | undefined>) {
  window.history.replaceState(null, '', href(path, query))
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

/** Chuyển trang (thêm vào lịch sử, nút Back của máy quay lại được) */
export function go(path: string, query: Record<string, string | null | undefined> = {}) {
  window.location.hash = href(path, query)
}
