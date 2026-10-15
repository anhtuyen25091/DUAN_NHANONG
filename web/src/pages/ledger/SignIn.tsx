import { ApiError, type LedgerSnapshot } from '@nhanong/shared'
import { useState, type FormEvent } from 'react'
import { api } from '../../api'
import { go, href } from '../../hooks'
import { deviceName, getSync } from '../../ledger/sync'
import { showToast } from '../../ledger/toast'

type Tab = 'register' | 'login'

/** Đăng nhập / tạo tài khoản bằng số điện thoại để bật "lưu cả trên mạng" */
export function SignIn({ data }: { data: LedgerSnapshot }) {
  const account = data.meta.account
  // Phiên hết hạn thì đăng nhập lại, số điện thoại điền sẵn
  const [tab, setTab] = useState<Tab>(account ? 'login' : 'register')
  const [form, setForm] = useState({ name: '', phone: account?.phone ?? '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

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
      await getSync().enable(token, user)
      showToast({ message: `Đã bật lưu cả trên mạng cho tài khoản ${user.phone ?? user.name}.` })
      go('so')
    } catch (error) {
      if (error instanceof ApiError) setErrors(error.errors)
      setMessage((error as Error).message)
    } finally {
      setSending(false)
    }
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
