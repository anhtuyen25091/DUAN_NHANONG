import { ApiError } from '@nhanong/shared'
import { useEffect } from 'react'
import { setAuth } from '../auth'
import type { AsyncState } from '../hooks'
import { href } from '../hooks'
import { syncIotWithNhanong } from '../iot'

let lastIotReconnect = 0

/** Vào lại Cảm biến bằng tài khoản Nhà Nông (iot.ts) rồi tải lại; tự làm tối đa 1 lần / 30 giây để không lặp mãi */
function IotReconnect({ retry }: { retry: () => void }) {
  useEffect(() => {
    if (Date.now() - lastIotReconnect < 30_000) return
    lastIotReconnect = Date.now()
    let active = true
    syncIotWithNhanong().then(
      () => active && retry(),
      () => {},
    )
    return () => {
      active = false
    }
  }, [retry])
  return (
    <div className="notice">
      <p>Đang kết nối mục Cảm biến với tài khoản của bạn…</p>
      <button type="button" onClick={() => syncIotWithNhanong().then(retry, retry)}>
        Thử lại
      </button>
    </div>
  )
}

/** Hiện trạng thái đang tải / lỗi; trả null khi đã có dữ liệu */
export function Status({ state, retry }: { state: AsyncState<unknown>; retry: () => void }) {
  if (state.status === 'loading') return <p className="muted center">Đang tải…</p>
  if (state.status === 'error') {
    // Máy chủ cảm biến từ chối token / chưa vào Cảm biến: vào lại bằng tài khoản Nhà Nông rồi tự tải lại
    if (state.error instanceof ApiError && state.error.status === 401 && state.error.service === 'iot') return <IotReconnect retry={retry} />
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
