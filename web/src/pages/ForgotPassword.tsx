import { ApiError, smsHref, type PasswordResetRequest } from '@nhanong/shared'
import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api'
import { setAuth } from '../auth'
import { href } from '../hooks'

const ios = /iPhone|iPad/.test(navigator.userAgent)

/**
 * Quên mật khẩu: 1) nhập số → 2) nhắn "NN mã" từ chính số đó tới số của hệ thống (người dùng tự trả phí tin nhắn),
 * trang tự chờ xác nhận → 3) đặt mật khẩu mới (đăng nhập luôn, các máy khác bị đăng xuất).
 */
export function ForgotPassword() {
  const [phone, setPhone] = useState('')
  const [request, setRequest] = useState<PasswordResetRequest | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  // Chờ người dùng nhắn tin: hỏi 3 giây 1 lần
  useEffect(() => {
    if (!request || request.status !== 'pending') return
    const timer = setInterval(async () => {
      try {
        const next = await api.forgotPasswordStatus(request.id)
        if (next.status !== 'pending') setRequest((r) => (r ? { ...r, status: next.status } : r))
      } catch {
        // Mất mạng: lần sau hỏi lại
      }
    }, 3000)
    return () => clearInterval(timer)
  }, [request])

  const start = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      setRequest(await api.forgotPassword(phone.trim()))
    } catch (err) {
      setError(err instanceof ApiError ? (Object.values(err.errors)[0]?.[0] ?? err.message) : (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const reset = async (e: FormEvent) => {
    e.preventDefault()
    if (!request) return
    setBusy(true)
    setError(null)
    try {
      setAuth(await api.resetPassword({ id: request.id, password, device_name: 'Web' }))
      setDone(true)
    } catch (err) {
      setError(err instanceof ApiError ? (Object.values(err.errors)[0]?.[0] ?? err.message) : (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (done)
    return (
      <div className="form card">
        <h1>Đã đặt mật khẩu mới ✅</h1>
        <p>Bạn đã đăng nhập. Các máy khác đang dùng tài khoản này đã bị đăng xuất, cần đăng nhập lại bằng mật khẩu mới.</p>
        <a className="button primary wide" href={href('tai-khoan')}>
          Về tài khoản
        </a>
      </div>
    )

  return (
    <div className="form card">
      <a className="back" href={href('tai-khoan')}>
        ‹ Đăng nhập
      </a>
      <h1>Quên mật khẩu</h1>

      {!request && (
        <form onSubmit={start}>
          <p className="small muted">Để lấy lại mật khẩu, bạn sẽ nhắn 1 tin từ số điện thoại của tài khoản (phí tin nhắn theo nhà mạng của bạn).</p>
          <label>
            Số điện thoại của tài khoản
            <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required maxLength={20} autoComplete="tel" placeholder="0912 345 678" />
          </label>
          {error && <div className="notice error">{error}</div>}
          <button type="submit" className="wide primary" disabled={busy}>
            {busy ? 'Đang gửi…' : 'Tiếp tục'}
          </button>
        </form>
      )}

      {request && (request.status === 'pending' || request.status === 'expired') && (
        <div className="sms-step">
          <p>
            Từ số <b>{request.phone}</b>, soạn tin:
          </p>
          <p className="sms-text">{request.sms_text}</p>
          <p>
            gửi tới <b className="nowrap">{request.sms_to}</b>
          </p>
          <a className="button primary wide" href={smsHref(request.sms_to!, request.sms_text!, ios)}>
            ✉️ Mở tin nhắn soạn sẵn
          </a>
          {request.status === 'pending' ? (
            <p className="small muted" aria-live="polite">
              ⏳ Đang chờ tin nhắn… (thường dưới 1 phút; mã hết hạn lúc {new Date(request.expires_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })})
            </p>
          ) : (
            <div className="notice error">
              Mã đã hết hạn.{' '}
              <button type="button" className="linklike" onClick={() => setRequest(null)}>
                Làm lại
              </button>
            </div>
          )}
        </div>
      )}

      {request?.status === 'verified' && (
        <form onSubmit={reset}>
          <div className="notice">✅ Đã nhận tin nhắn từ số {request.phone}. Đặt mật khẩu mới:</div>
          <label>
            Mật khẩu mới
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} maxLength={100} autoComplete="new-password" />
          </label>
          {error && <div className="notice error">{error}</div>}
          <button type="submit" className="wide primary" disabled={busy || password.length < 6}>
            {busy ? 'Đang lưu…' : 'Lưu mật khẩu mới'}
          </button>
        </form>
      )}
    </div>
  )
}
