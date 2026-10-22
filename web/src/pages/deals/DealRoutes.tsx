import { ApiError, appJoinLink, formatDate, formatVnd, today, type DealRole } from '@nhanong/shared'
import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../../api'
import { useAuth } from '../../auth'
import { dealWatcher } from '../../dealWatch'
import { Status } from '../../components/Status'
import { go, href, useAsync } from '../../hooks'
import { MoneyField } from '../ledger/fields'
import { DealDetail } from './DealDetail'
import { counterpartName } from './dealText'
import { EntryForm } from './EntryForm'
import { DateField } from '../../components/DateField'

/**
 * #/don/...: đơn mua bán chung 2 bên (tải riêng).
 * #/don, #/don/moi, #/don/tham-gia?ma=, #/don/:uuid, #/don/:uuid/muc-moi?loai=, #/don/:uuid/muc/:entry
 */
export default function DealRoutes({ path, query }: { path: string[]; query: URLSearchParams }) {
  const auth = useAuth()
  const [, page, action, sub] = path

  if (!auth)
    return (
      <div className="ledger">
        <h1>🤝 Đơn mua bán</h1>
        <div className="notice upgrade">
          <p>Đơn mua bán dùng chung giữa nông dân, thương lái và chi nhánh thu mua. Cần đăng nhập để tạo đơn hoặc tham gia bằng mã.</p>
          <a className="button primary" href={href('tai-khoan', { ve: path.join('/') + (query.toString() ? `?${query}` : '') })}>
            Đăng nhập / Đăng ký
          </a>
        </div>
        {page === 'tham-gia' && query.get('ma') && <OpenInApp code={query.get('ma')!} />}
      </div>
    )

  if (page === 'moi') return <DealCreate token={auth.token} />
  if (page === 'tham-gia') return <DealJoin token={auth.token} initialCode={query.get('ma') ?? ''} />
  if (page && action === 'muc-moi') return <EntryForm key={`new-${query.get('loai')}`} token={auth.token} dealUuid={page} kind={query.get('loai') ?? 'cut'} />
  if (page && action === 'muc' && sub) return <EntryForm key={sub} token={auth.token} dealUuid={page} entryUuid={sub} />
  if (page) return <DealDetail key={page} token={auth.token} uuid={page} />
  return <DealList token={auth.token} />
}

function DealList({ token }: { token: string }) {
  const [state, retry] = useAsync(() => api.deals(token), [token])
  const [tab, setTab] = useState<'open' | 'closed'>('open')
  const deals = state.status === 'ok' ? state.data.filter((d) => (tab === 'open' ? d.status === 'open' : d.status !== 'open')) : []
  const waiting = state.status === 'ok' ? state.data.reduce((s, d) => s + d.summary.awaiting_me, 0) : 0

  return (
    <div className="ledger">
      <h1>🤝 Đơn mua bán</h1>
      <p className="small muted">Đơn dùng chung 2 bên: bên mua (thương lái, chi nhánh) và bên bán (nông dân, lái bán lại). Mỗi bên ghi, bên kia xác nhận.</p>
      <div className="btn-row">
        <a className="button primary" href={href('don/moi')}>
          ＋ Tạo đơn
        </a>
        <a className="button" href={href('don/tham-gia')}>
          🔑 Nhập mã đơn / phiếu
        </a>
        <a className="button" href={href('giao-dich')}>
          📒 Sổ giao dịch, in phiếu
        </a>
        <a className="button" href={href('chao-ban')}>
          📣 Chào bán / chợ lô hàng
        </a>
      </div>
      {waiting > 0 && <div className="notice upgrade">🔔 Có {waiting} mục bên kia vừa ghi, chờ bạn xác nhận.</div>}
      <ReceivedPurchases token={token} />
      <BrowserNotifyPrompt />

      <nav className="segmented" aria-label="Lọc đơn">
        <button type="button" className={tab === 'open' ? 'active' : ''} aria-pressed={tab === 'open'} onClick={() => setTab('open')}>
          Đang mở
        </button>
        <button type="button" className={tab === 'closed' ? 'active' : ''} aria-pressed={tab === 'closed'} onClick={() => setTab('closed')}>
          Đã xong / hủy
        </button>
      </nav>
      <Status state={state} retry={retry} />
      {state.status === 'ok' && deals.length === 0 && <p className="muted">Chưa có đơn nào.</p>}
      <div className="garden-list">
        {deals.map((d) => (
          <a key={d.uuid} className="card garden-row" href={href(`don/${d.uuid}`)}>
            <span className="garden-name">
              {d.my_role === 'buyer' ? '🛒' : '🌳'} {d.title}
              <span className="small muted">
                {' '}
                · {d.my_role === 'buyer' ? 'mình mua của' : 'mình bán cho'} {counterpartName(d)}
              </span>
              {!d.joined && <span className="tag">Mã {d.code}</span>}
              {d.summary.awaiting_me > 0 && <span className="tag overdue">🔔 {d.summary.awaiting_me} chờ bạn</span>}
              {d.summary.disputed > 0 && <span className="tag overdue">⚠️ {d.summary.disputed} báo sai</span>}
            </span>
            <span className="profit">{formatVnd(d.summary.confirmed.delivered)}</span>
          </a>
        ))}
      </div>
    </div>
  )
}

/** Phiếu mua / bán điểm thu mua gửi cho mình (chỉ xem) */
function ReceivedPurchases({ token }: { token: string }) {
  const [state, retry] = useAsync(() => api.receivedPurchases(token), [token])
  // Có phiếu mới được gửi / bị sửa: tải lại danh sách
  useEffect(() => dealWatcher.onDealChanged(() => retry()), [retry])
  if (state.status !== 'ok' || state.data.length === 0) return null
  return (
    <section>
      <h2 className="section">📄 Phiếu được gửi cho bạn</h2>
      <div className="garden-list">
        {state.data.map((p) => (
          <a key={p.id} className="card garden-row" href={href(`giao-dich/nhan/${p.id}`)}>
            <span className="garden-name">
              {p.issuer.name}
              <span className="small muted">
                {' '}
                · {p.code} · {formatDate(p.date, true)} · mình {p.kind === 'sell' ? 'bán' : 'mua'}
              </span>
              {p.deleted_at && <span className="tag overdue">Người lập đã xóa</span>}
              {!p.deleted_at && p.edited_after_share && <span className="tag overdue">Đã sửa sau khi gửi</span>}
            </span>
            <span className="profit">{formatVnd(p.amount)}</span>
          </a>
        ))}
      </div>
    </section>
  )
}

/** Mời bật thông báo của trình duyệt để biết khi bên kia ghi / xác nhận lúc đang ở tab khác */
function BrowserNotifyPrompt() {
  const [permission, setPermission] = useState(() => ('Notification' in window ? Notification.permission : 'denied'))
  if (permission !== 'default') return null
  return (
    <p className="small">
      <button type="button" className="linklike" onClick={async () => setPermission(await Notification.requestPermission())}>
        🔔 Bật thông báo trên máy này
      </button>{' '}
      <span className="muted">để biết ngay khi bên kia ghi hoặc xác nhận, kể cả lúc đang mở tab khác.</span>
    </p>
  )
}

function DealCreate({ token }: { token: string }) {
  const [role, setRole] = useState<DealRole>('buyer')
  const [title, setTitle] = useState('')
  const [counterpart, setCounterpart] = useState('')
  const [deposit, setDeposit] = useState(0)
  const [depositDate, setDepositDate] = useState(today())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSending(true)
    setError(null)
    try {
      const deal = await api.createDeal(token, { role, title, counterpart_name: counterpart || null, note: note || null, deposit: deposit || undefined, deposit_date: depositDate })
      go(`don/${deal.uuid}`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSending(false)
    }
  }

  return (
    <form className="form ledger" onSubmit={submit}>
      <a className="back" href={href('don')}>
        ‹ Đơn mua bán
      </a>
      <h1>Tạo đơn mua bán</h1>
      <div className="type-switch" role="tablist">
        <button type="button" role="tab" aria-selected={role === 'buyer'} className={role === 'buyer' ? 'active out' : ''} onClick={() => setRole('buyer')}>
          🛒 Tôi là bên mua
        </button>
        <button type="button" role="tab" aria-selected={role === 'seller'} className={role === 'seller' ? 'active in' : ''} onClick={() => setRole('seller')}>
          🌳 Tôi là bên bán
        </button>
      </div>
      <p className="small muted">
        {role === 'buyer' ? 'Thương lái / chi nhánh đi mua, đặt cọc cho nông dân hoặc lái nhỏ.' : 'Nông dân bán vườn, hoặc thương lái bán lại hàng cho chi nhánh.'} Tạo xong sẽ có mã để gửi cho bên kia
        tham gia.
      </p>
      <label>
        Tên đơn *
        <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} placeholder="Ví dụ: Sầu riêng Ri6 vườn chú Ba" />
      </label>
      <label>
        {role === 'buyer' ? 'Mua của ai' : 'Bán cho ai'}
        <input value={counterpart} onChange={(e) => setCounterpart(e.target.value)} maxLength={120} placeholder={role === 'buyer' ? 'Ví dụ: Vườn chú Ba' : 'Ví dụ: Chi nhánh Tân Phú'} />
      </label>
      <MoneyField label="Tiền cọc (nếu có)" value={deposit} onChange={setDeposit} />
      {deposit > 0 && (
        <DateField label="Ngày cọc" value={depositDate} onChange={setDepositDate} max={today()} />
      )}
      <label>
        Ghi chú
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Ví dụ: bao cả vườn, giá theo chợ từng đợt" />
      </label>
      {error && <div className="notice error">{error}</div>}
      <button type="submit" className="wide primary" disabled={!title.trim() || sending}>
        {sending ? 'Đang tạo…' : 'Tạo đơn và lấy mã'}
      </button>
    </form>
  )
}

function DealJoin({ token, initialCode }: { token: string; initialCode: string }) {
  const [code, setCode] = useState(initialCode)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSending(true)
    setError(null)
    try {
      const deal = await api.joinDeal(token, code)
      go(`don/${deal.uuid}`)
    } catch (err) {
      // Không phải mã đơn: thử mã phiếu (điểm thu mua gửi phiếu cho khách xem)
      if (err instanceof ApiError && err.errors.code?.[0]?.startsWith('Không tìm thấy')) {
        try {
          const received = await api.receivePurchase(token, code)
          go(`giao-dich/nhan/${received.id}`)
          return
        } catch {
          setError('Không tìm thấy đơn hoặc phiếu với mã này. Kiểm tra lại mã.')
          return
        }
      }
      setError(err instanceof ApiError && err.errors.code ? err.errors.code[0] : (err as Error).message)
    } finally {
      setSending(false)
    }
  }

  return (
    <form className="form ledger" onSubmit={submit}>
      <a className="back" href={href('don')}>
        ‹ Đơn mua bán
      </a>
      <h1>🔑 Nhập mã đơn / phiếu</h1>
      {initialCode && <OpenInApp code={initialCode} />}
      <p className="small muted">
        Nhập mã 6 ký tự bên kia gửi (ví dụ NN7K3P). Mã đơn: 2 bên cùng xem và xác nhận các đợt cân, tiền cọc, tiền trả. Mã phiếu: xem và tải phiếu mua / bán điểm thu mua gửi cho bạn.
      </p>
      <label>
        Mã
        <input className="code-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12} autoCapitalize="characters" autoComplete="off" required placeholder="NN7K3P" />
      </label>
      {error && <div className="notice error">{error}</div>}
      <button type="submit" className="wide primary" disabled={code.replace(/[^A-Za-z0-9]/g, '').length < 6 || sending}>
        {sending ? 'Đang mở…' : 'Mở'}
      </button>
    </form>
  )
}

/** Trên điện thoại: mở thẳng app Nhà Nông (nếu đã cài) ở màn nhập mã, mã điền sẵn */
function OpenInApp({ code }: { code: string }) {
  if (!/Android|iPhone|iPad/.test(navigator.userAgent)) return null
  return (
    <a className="button wide open-in-app" href={appJoinLink(code)}>
      📱 Mở trong app Nhà Nông (mã {code})
    </a>
  )
}
