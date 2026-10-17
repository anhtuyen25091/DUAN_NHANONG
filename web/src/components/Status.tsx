import { ApiError } from '@nhanong/shared'
import { setAuth } from '../auth'
import type { AsyncState } from '../hooks'
import { href } from '../hooks'

/** Hiện trạng thái đang tải / lỗi; trả null khi đã có dữ liệu */
export function Status({ state, retry }: { state: AsyncState<unknown>; retry: () => void }) {
  if (state.status === 'loading') return <p className="muted center">Đang tải…</p>
  if (state.status === 'error') {
    // Phiên đăng nhập hết hạn (đăng nhập ở máy khác, đổi mật khẩu…): mời đăng nhập lại, không hiện chữ lỗi khó hiểu
    if (state.error instanceof ApiError && state.error.status === 401)
      return (
        <div className="notice">
          <p>Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại để tiếp tục.</p>
          <a className="button primary" href={href('tai-khoan', { ve: window.location.hash.replace(/^#\//, '') })} onClick={() => setAuth(null)}>
            Đăng nhập lại
          </a>
        </div>
      )
    return (
      <div className="notice error">
        <p>{state.error.message}</p>
        <button type="button" onClick={retry}>
          Thử lại
        </button>
      </div>
    )
  }
  return null
}
