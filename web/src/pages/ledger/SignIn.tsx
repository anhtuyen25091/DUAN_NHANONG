import { CLOUD_PRIVACY_NOTE, ApiError, previousAccount, type AccountUser, type LedgerSnapshot } from '@nhanong/shared'
import { useState, type FormEvent } from 'react'
import { api } from '../../api'
import { setAuth, useAuth } from '../../auth'
import { go, href } from '../../hooks'
import { deviceName, getSync } from '../../ledger/sync'
import { showToast } from '../../ledger/toast'

type Tab = 'register' | 'login'

/** Đăng nhập / tạo tài khoản bằng số điện thoại để bật "lưu cả trên mạng" */
export function SignIn({ data }: { data: LedgerSnapshot }) {
  const account = data.meta.account
  const signedIn = useAuth()
  // Phiên hết hạn thì đăng nhập lại, số điện thoại điền sẵn
  const [tab, setTab] = useState<Tab>(account ? 'login' : 'register')
  const [form, setForm] = useState({ name: '', phone: account?.phone ?? '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  // Đăng nhập tài khoản khác trên máy đang có sổ của tài khoản trước: hỏi gộp hay bỏ sổ trên máy
  const [conflict, setConflict] = useState<{ token: string; user: AccountUser; previous: string; fresh: boolean } | null>(null)

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value })
  const hasData = data.transactions.length > 0 || data.gardens.length > 0

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSending(true)
    setErrors({})
    setMessage(null)
    try {
      const input = { phone: form.phone.trim(), password: form.password, device_name: deviceName() }
      const { token, user } = tab === 'register' ? await api.register({ ...input, name: form.name.trim() }) : await api.login(input)
      const previous = previousAccount(data, user)
      if (previous) setConflict({ token, user, previous, fresh: true })
      else await finish(token, user)
    } catch (error) {
      if (error instanceof ApiError) setErrors(error.errors)
      setMessage((error as Error).message)
    } finally {
      setSending(false)
    }
  }

  const finish = async (token: string, user: AccountUser, discardLocal = false, fresh = true) => {
    await getSync().enable(token, user, { discardLocal })
    // Dùng luôn tài khoản này để xem lịch sử giá dài hơn
    setAuth(fresh || !signedIn ? { token, user, shared: true } : { ...signedIn, shared: true })
    showToast({ message: `Đã bật lưu cả trên mạng cho tài khoản ${user.phone ?? user.name}.` })
    go('so')
  }

  const choose = async (discardLocal: boolean | null) => {
    if (!conflict) return
    setSending(true)
    setMessage(null)
    try {
      if (discardLocal === null) {
        // Thôi: không đổi gì, hủy phiên vừa đăng nhập (trừ khi đó là phiên đang dùng để xem giá)
        if (conflict.fresh) await api.logout(conflict.token).catch(() => {})
        setConflict(null)
        return
      }
      await finish(conflict.token, conflict.user, discardLocal, conflict.fresh)
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setSending(false)
    }
  }

  if (conflict) {
    const next = conflict.user.phone ?? conflict.user.name
    return (
      <div className="form ledger">
        <h1>Máy này đang có sổ của tài khoản khác</h1>
        <p>
          Sổ trên máy đang gắn với tài khoản <b>{conflict.previous}</b>. Bạn vừa đăng nhập <b>{next}</b>. Bạn muốn làm gì với sổ đang có trên máy?
        </p>
        <div className="switch-choices">
          <button type="button" className="wide primary" disabled={sending} onClick={() => choose(false)}>
            Gộp sổ trên máy vào tài khoản {next}
          </button>
          <p className="muted small">Các khoản thu chi trên máy được gửi lên tài khoản {next}, cộng chung với sổ đã có của tài khoản đó.</p>
          <button
            type="button"
            className="wide danger-outline"
            disabled={sending}
            onClick={() => {
              if (confirm(`Xóa sổ đang có trên máy này và chỉ dùng sổ của tài khoản ${next}? Sổ của ${conflict.previous} đã lưu trên mạng vẫn còn, đăng nhập lại là có.`)) void choose(true)
            }}
          >
            Bỏ sổ trên máy, chỉ dùng sổ của {next}
          </button>
          <p className="muted small">Hợp khi máy này dùng chung, hoặc sổ trên máy là của người khác.</p>
          <button type="button" className="wide" disabled={sending} onClick={() => choose(null)}>
            Thôi, không đổi gì
          </button>
        </div>
        {message && <div className="notice error">{message}</div>}
      </div>
    )
  }

  const error = (key: string) => errors[key] && <span className="field-error">{errors[key][0]}</span>
  // Lỗi đã hiện dưới ô nhập thì không lặp lại ở cuối form
  const generalMessage = message && Object.keys(errors).length === 0 ? message : null

  return (
    <form className="form ledger" onSubmit={submit}>
      <a className="back" href={href(data.meta.storage_mode ? 'so/cai-dat' : 'so')}>
        ‹ {data.meta.storage_mode ? 'Cài đặt sổ' : 'Chọn nơi lưu'}
      </a>
      <h1>☁️ Lưu cả trên mạng</h1>
      <p className="muted small">
        Dùng số điện thoại để đăng nhập. Đổi máy hoặc mất máy chỉ cần đăng nhập lại là có đủ sổ.
        {hasData && ' Sổ đang có trên máy này sẽ được gửi lên tài khoản.'}
      </p>
      <p className="muted small">🔒 {CLOUD_PRIVACY_NOTE}</p>

      {signedIn && !account && (
        <div className="notice">
          <p>
            Bạn đang đăng nhập tài khoản <b>{signedIn.user.phone ?? signedIn.user.name}</b>.
          </p>
          <button
            type="button"
            className="primary"
            onClick={async () => {
              const previous = previousAccount(data, signedIn.user)
              if (previous) setConflict({ token: signedIn.token, user: signedIn.user, previous, fresh: false })
              else await finish(signedIn.token, signedIn.user, false, false)
            }}
          >
            Dùng tài khoản này
          </button>
        </div>
      )}
      <nav className="segmented" aria-label="Loại tài khoản">
        <button type="button" className={tab === 'register' ? 'active' : ''} aria-pressed={tab === 'register'} onClick={() => setTab('register')}>
          Tạo tài khoản mới
        </button>
        <button type="button" className={tab === 'login' ? 'active' : ''} aria-pressed={tab === 'login'} onClick={() => setTab('login')}>
          Đã có tài khoản
        </button>
      </nav>

      {tab === 'register' && (
        <label>
          Tên của bạn
          <input value={form.name} onChange={set('name')} required maxLength={100} autoComplete="name" placeholder="Ví dụ: Chú Ba Tâm" />
          {error('name')}
        </label>
      )}
      <label>
        Số điện thoại
        <input type="tel" inputMode="tel" value={form.phone} onChange={set('phone')} required maxLength={20} autoComplete="tel" placeholder="0912 345 678" />
        {error('phone')}
      </label>
      <label>
        Mật khẩu
        <input
          type={showPassword ? 'text' : 'password'}
          value={form.password}
          onChange={set('password')}
          required
          minLength={tab === 'register' ? 6 : undefined}
          maxLength={100}
          autoComplete={tab === 'register' ? 'new-password' : 'current-password'}
        />
        {tab === 'register' && <span className="small muted">Ít nhất 6 ký tự. Ghi lại ở chỗ an toàn để không quên.</span>}
        {error('password')}
      </label>
      <label className="checkbox">
        <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
        Hiện mật khẩu
      </label>

      {generalMessage && <div className="notice error">{generalMessage}</div>}

      <button type="submit" className="wide primary" disabled={sending}>
        {sending ? 'Đang gửi…' : tab === 'register' ? 'Tạo tài khoản và bật lưu trên mạng' : 'Đăng nhập'}
      </button>
    </form>
  )
}
