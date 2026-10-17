import { ApiError, formatDate, formatVnd } from '@nhanong/shared'
import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api'
import { setAuth, updateAuthUser, useAuth } from '../auth'
import { adoptAccountLocation } from '../myLocation'
import { Status } from '../components/Status'
import { href, useAsync } from '../hooks'

/**
 * #/tai-khoan: đăng nhập / đăng ký bằng số điện thoại, xem mức xem giá và các gói.
 * ?ve=path: quay lại trang đó sau khi đăng nhập (ví dụ trang biểu đồ giá).
 */
export function Account({ query }: { query: URLSearchParams }) {
  const auth = useAuth()
  const back = query.get('ve')
  const [plans, retryPlans] = useAsync(() => api.plans(), [])

  // Cập nhật mức xem / hạn gói mới nhất (admin vừa kích hoạt gói…)
  useEffect(() => {
    if (!auth) return
    api.me(auth.token).then((user) => {
      updateAuthUser(user)
      adoptAccountLocation(user.location)
    }, (error) => {
      if (error instanceof ApiError && error.status === 401) setAuth(null)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.token])

  const limits = plans.status === 'ok' ? plans.data.limits : { guest_days: 10, member_days: 30 }

  return (
    <div className="ledger">
      {back && (
        <a className="back" href={`#/${back}`}>
          ‹ Quay lại
        </a>
      )}
      <h1>👤 Tài khoản</h1>

      {auth ? <SignedIn /> : <SignInForm memberDays={limits.member_days} guestDays={limits.guest_days} back={back} />}

      <h2 className="section">Xem lịch sử giá</h2>
      <section className="card tiers">
        <p>
          <b>Chưa đăng nhập:</b> xem {limits.guest_days} ngày gần nhất
        </p>
        <p>
          <b>Đăng ký miễn phí:</b> xem {limits.member_days} ngày gần nhất
        </p>
        <p>
          <b>Có gói:</b> xem toàn bộ lịch sử (tới 5 năm), so sánh giá các năm
        </p>
      </section>

      <Status state={plans} retry={retryPlans} />
      {plans.status === 'ok' && (
        <div className="plan-grid">
          {plans.data.data.map((p) => (
            <section key={p.code} className="card plan">
              <h3>{p.name}</h3>
              <p className="big">{formatVnd(p.price)}</p>
              <p className="small muted">{p.months === 1 ? '1 tháng' : `${p.months} tháng`}</p>
              {p.description && <p className="small">{p.description}</p>}
            </section>
          ))}
        </div>
      )}
      <p className="notice small">
        Thanh toán trong app sẽ có ở bản sau. Hiện tại: liên hệ Nhà Nông, báo số điện thoại{auth?.user.phone ? ` ${auth.user.phone}` : ' đã đăng ký'} và gói muốn mua để được kích hoạt.
      </p>
    </div>
  )
}

function SignedIn() {
  const auth = useAuth()!
  const { user } = auth
  const premium = user.tier === 'premium'

  const logout = async () => {
    // Token dùng chung với "lưu cả trên mạng" của sổ thì không hủy trên server (sổ vẫn đồng bộ được)
    if (!auth.shared) await api.logout(auth.token).catch(() => {})
    setAuth(null)
  }

  return (
    <section className="card">
      <p>
        <b>{user.name}</b>
        {user.phone && <span className="muted"> · {user.phone}</span>}
      </p>
      <p className={premium ? 'in' : ''}>
        {premium ? `⭐ Có gói xem giá${user.premium_until ? ` đến ${formatDate(user.premium_until)}` : ''}` : 'Tài khoản thường (chưa có gói)'}
      </p>
      <p>
        <a href={href('diem-mua')}>🏪 {user.buyer_status === 'approved' ? 'Đăng giá của điểm mua' : user.buyer_status ? 'Hồ sơ điểm mua' : 'Tôi là doanh nghiệp / đại lý / thương lái: đăng giá'} ›</a>
      </p>
      <p>
        <a href={href('gia-quanh-toi')}>📍 Khu vực của tôi &amp; giá quanh tôi ›</a>
      </p>
      <p>
        <a href={href('doanh-nghiep')}>🏢 Doanh nghiệp thu mua (chủ + các lái đi mua giùm) ›</a>
      </p>
      <button type="button" onClick={logout}>
        Đăng xuất
      </button>
    </section>
  )
}

type Tab = 'register' | 'login'

function SignInForm({ memberDays, guestDays, back }: { memberDays: number; guestDays: number; back: string | null }) {
  const [tab, setTab] = useState<Tab>('register')
  const [form, setForm] = useState({ name: '', phone: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSending(true)
    setErrors({})
    setMessage(null)
    try {
      const input = { phone: form.phone.trim(), password: form.password, device_name: 'Web' }
      const result = tab === 'register' ? await api.register({ ...input, name: form.name.trim() }) : await api.login(input)
      setAuth(result)
      if (back) window.location.hash = `#/${back}`
    } catch (error) {
      if (error instanceof ApiError) setErrors(error.errors)
      setMessage((error as Error).message)
    } finally {
      setSending(false)
    }
  }

  const error = (key: string) => errors[key] && <span className="field-error">{errors[key][0]}</span>

  return (
    <form className="form card" onSubmit={submit}>
      <p className="small muted">
        Đăng ký miễn phí bằng số điện thoại để xem giá {memberDays} ngày gần nhất (chưa đăng nhập chỉ xem {guestDays} ngày).
      </p>
      <nav className="segmented switch" aria-label="Loại tài khoản">
        <button type="button" className={tab === 'register' ? 'active' : ''} aria-pressed={tab === 'register'} onClick={() => setTab('register')}>
          📝 Đăng ký mới
        </button>
        <button type="button" className={tab === 'login' ? 'active' : ''} aria-pressed={tab === 'login'} onClick={() => setTab('login')}>
          🔑 Đăng nhập
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
        {error('password')}
      </label>
      <label className="checkbox">
        <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
        Hiện mật khẩu
      </label>
      {message && Object.keys(errors).length === 0 && <div className="notice error">{message}</div>}
      <button type="submit" className="wide primary" disabled={sending}>
        {sending ? 'Đang gửi…' : tab === 'register' ? 'Tạo tài khoản' : 'Đăng nhập'}
      </button>
      {tab === 'login' && (
        <a className="center small" href={href('tai-khoan/quen-mat-khau')}>
          Quên mật khẩu?
        </a>
      )}
    </form>
  )
}
