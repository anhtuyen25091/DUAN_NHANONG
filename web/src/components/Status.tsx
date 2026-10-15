import type { AsyncState } from '../hooks'

/** Hiện trạng thái đang tải / lỗi; trả null khi đã có dữ liệu */
export function Status({ state, retry }: { state: AsyncState<unknown>; retry: () => void }) {
  if (state.status === 'loading') return <p className="muted center">Đang tải…</p>
  if (state.status === 'error')
    return (
      <div className="notice error">
        <p>{state.error.message}</p>
        <button type="button" onClick={retry}>
          Thử lại
        </button>
      </div>
    )
  return null
}
