import {
  ADVANCE_KIND_LABELS,
  ApiError,
  businessInviteText,
  formatDate,
  formatKg,
  formatVnd,
  PRICE_MODE_LABELS,
  today,
  TRADE_KIND_LABELS,
  type AdvanceKind,
  type Business,
  type BusinessMemberInfo,
  type BuyPriceLimit,
  type MemberCash,
  type PriceMode,
  type TradeKind,
} from '@nhanong/shared'
import { useState, type FormEvent } from 'react'
import { api } from '../../api'
import { useAuth } from '../../auth'
import { DateField } from '../../components/DateField'
import { PrintButtons } from '../../components/PrintButtons'
import { Status } from '../../components/Status'
import { href, replaceQuery, useAsync } from '../../hooks'
import { showToast } from '../../ledger/toast'
import { MoneyField } from '../ledger/fields'
import { RangeFields, TotalsCard, TradeRowCard } from '../trade/parts'
import { useRange } from '../trade/useRange'

type Tab = 'tong-quan' | 'gia' | 'lai' | 'tien-ung' | 'so' | 'don' | 'thong-tin'

const OWNER_TABS: [Tab, string][] = [
  ['tong-quan', 'Tổng quan'],
  ['gia', 'Giá chốt'],
  ['lai', 'Lái'],
  ['tien-ung', 'Tiền ứng'],
  ['so', 'Giao dịch'],
  ['don', 'Đơn chung'],
  ['thong-tin', 'Thông tin'],
]

const errorText = (err: unknown) => (err instanceof ApiError ? (Object.values(err.errors)[0]?.[0] ?? err.message) : (err as Error).message)

/**
 * #/doanh-nghiep?tab=: doanh nghiệp thu mua (tải riêng).
 * Chưa có: tạo doanh nghiệp hoặc nhập mã mời. Chủ: tổng quan từng lái, quản lý lái, tiền ứng, sổ cả doanh nghiệp.
 * Lái con: tiền mình đang giữ, các lần ứng / nộp lại.
 */
export default function BusinessPage({ query }: { query: URLSearchParams }) {
  const auth = useAuth()
  const [state, retry] = useAsync(() => (auth ? api.business(auth.token) : Promise.resolve(null)), [auth?.token])

  if (!auth)
    return (
      <div className="ledger">
        <h1>🏢 Doanh nghiệp</h1>
        <div className="notice upgrade">
          <p>Dành cho doanh nghiệp thu mua có nhiều lái đi mua giùm: chủ tạo tài khoản cho lái, ứng tiền, xem thống kê từng lái. Cần đăng nhập.</p>
          <a className="button primary" href={href('tai-khoan', { ve: 'doanh-nghiep' })}>
            Đăng nhập / Đăng ký
          </a>
        </div>
      </div>
    )
  if (state.status !== 'ok') return <Status state={state} retry={retry} />
  const business = state.data
  if (!business) return <NoBusiness token={auth.token} onDone={retry} />
  if (business.my_role !== 'owner') return <MemberView token={auth.token} business={business} onLeft={retry} />

  const tab = (OWNER_TABS.find(([t]) => t === query.get('tab'))?.[0] ?? 'tong-quan') as Tab
  return (
    <div className="ledger">
      <h1>🏢 {business.name}</h1>
      <p className="small muted">Bạn là chủ · {business.members?.length ?? 0} tài khoản (gồm chủ). Phiếu, đơn chung các lái lập đều về đây.</p>
      <nav className="segmented wrap" aria-label="Mục">
        {OWNER_TABS.map(([key, label]) => (
          <button key={key} type="button" className={tab === key ? 'active' : ''} aria-pressed={tab === key} onClick={() => replaceQuery('doanh-nghiep', { tab: key })}>
            {label}
          </button>
        ))}
      </nav>
      {tab === 'tong-quan' && <Overview token={auth.token} />}
      {tab === 'gia' && <BuyPrices token={auth.token} />}
      {tab === 'lai' && <Members token={auth.token} business={business} onChange={retry} />}
      {tab === 'tien-ung' && <Advances token={auth.token} business={business} initialMember={Number(query.get('lai')) || undefined} />}
      {tab === 'so' && <BusinessTrades token={auth.token} business={business} initialMember={Number(query.get('lai')) || undefined} />}
      {tab === 'don' && <BusinessDeals token={auth.token} />}
      {tab === 'thong-tin' && <BusinessForm token={auth.token} business={business} onSaved={retry} />}
    </div>
  )
}

function NoBusiness({ token, onDone }: { token: string; onDone: () => void }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const join = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await api.joinBusiness(token, code)
      showToast({ message: 'Đã vào doanh nghiệp' })
      onDone()
    } catch (err) {
      setError(errorText(err))
    }
  }
  return (
    <div className="ledger">
      <h1>🏢 Doanh nghiệp</h1>
      <p className="small muted">Doanh nghiệp thu mua có nhiều lái đi mua giùm: chủ tạo tài khoản cho từng lái, ứng tiền, xem lái nào mua bao nhiêu, đang giữ bao nhiêu tiền.</p>
      <form className="card form" onSubmit={join}>
        <h2>Tôi là lái: nhập mã mời</h2>
        <label>
          Mã mời chủ gửi
          <input className="code-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12} autoComplete="off" placeholder="NN7K3P" />
        </label>
        {error && <div className="notice error">{error}</div>}
        <button type="submit" className="wide primary" disabled={code.replace(/[^A-Za-z0-9]/g, '').length < 6}>
          Vào doanh nghiệp
        </button>
      </form>
      <h2 className="section">Tôi là chủ: tạo doanh nghiệp</h2>
      <BusinessForm token={token} onSaved={onDone} />
    </div>
  )
}

function BusinessForm({ token, business, onSaved }: { token: string; business?: Business; onSaved: () => void }) {
  const [name, setName] = useState(business?.name ?? '')
  const [phone, setPhone] = useState(business?.phone ?? '')
  const [address, setAddress] = useState(business?.address ?? '')
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      const input = { name: name.trim(), phone: phone.trim() || null, address: address.trim() || null }
      await (business ? api.updateBusiness(token, input) : api.createBusiness(token, input))
      showToast({ message: business ? 'Đã lưu thông tin' : 'Đã tạo doanh nghiệp' })
      onSaved()
    } catch (err) {
      setError(errorText(err))
    }
  }
  return (
    <form className="card form" onSubmit={submit}>
      <p className="small muted">Tên, SĐT, địa chỉ in trên đầu mọi phiếu các lái lập.</p>
      <label>
        Tên doanh nghiệp *
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={150} placeholder="Ví dụ: Công ty Nông sản Hai Lúa" />
      </label>
      <label>
        Số điện thoại
        <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={20} />
      </label>
      <label>
        Địa chỉ
        <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={255} />
      </label>
      {error && <div className="notice error">{error}</div>}
      <button type="submit" className="wide primary" disabled={!name.trim()}>
        {business ? 'Lưu thông tin' : 'Tạo doanh nghiệp'}
      </button>
    </form>
  )
}

function CashCard({ cash, title = 'Tiền đang giữ' }: { cash: MemberCash; title?: string }) {
  return (
    <section className={`card profit-card ${cash.holding < 0 ? 'loss' : 'gain'}`}>
      <p className="small muted">{title}</p>
      <p className="big">{formatVnd(cash.holding)}</p>
      <dl className="deal-totals">
        <div>
          <dt>Chủ đã ứng</dt>
          <dd>{formatVnd(cash.advanced)}</dd>
        </div>
        <div>
          <dt>Đã nộp lại chủ</dt>
          <dd>−{formatVnd(cash.returned)}</dd>
        </div>
        <div>
          <dt>Đã trả cho người bán (phiếu, cọc, đợt cân)</dt>
          <dd className="out">−{formatVnd(cash.paid_out)}</dd>
        </div>
        <div>
          <dt>Đã thu khi bán</dt>
          <dd className="in">+{formatVnd(cash.received)}</dd>
        </div>
      </dl>
      {cash.holding < 0 && <p className="small out">Âm: lái đã trả nhiều hơn tiền được ứng (đang bù tiền riêng).</p>}
    </section>
  )
}

/** Lái con: doanh nghiệp mình đang mua giùm, tiền đang giữ, các lần ứng / nộp lại */
function MemberView({ token, business, onLeft }: { token: string; business: Business; onLeft: () => void }) {
  const [advances, retry] = useAsync(() => api.businessAdvances(token), [token])
  return (
    <div className="ledger">
      <h1>🏢 {business.name}</h1>
      <p className="muted">
        Bạn là lái mua giùm cho {business.owner.name}
        {business.my_group ? ` · ${business.my_group}` : ''}. Phiếu và đơn chung bạn lập đều thuộc doanh nghiệp, chủ xem được.
      </p>
      {business.my_status === 'locked' && <div className="notice error">Tài khoản đang bị chủ khóa: chưa lập phiếu / đơn mới được. Hãy liên hệ chủ.</div>}
      <div className="btn-row">
        <a className="button primary" href={href('giao-dich/moi', { loai: 'buy' })}>
          ＋ Phiếu mua
        </a>
        <a className="button" href={href('giao-dich')}>
          📒 Phiếu của tôi
        </a>
      </div>
      <TodayPrices token={token} mode={business.price_mode} />
      {business.my_cash && <CashCard cash={business.my_cash} />}
      <h2 className="section">Các lần ứng / nộp lại</h2>
      <Status state={advances} retry={retry} />
      {advances.status === 'ok' && advances.data.data.length === 0 && <p className="muted">Chưa có.</p>}
      <div className="entries">
        {advances.status === 'ok' &&
          advances.data.data.map((a) => (
            <div key={a.id} className="entry">
              <span className="entry-main">
                <span className="entry-text">
                  <span>{ADVANCE_KIND_LABELS[a.kind]}</span>
                  <span className="small muted">
                    {formatDate(a.date)}
                    {a.note ? ` · ${a.note}` : ''}
                  </span>
                </span>
                <span className={`amount ${a.kind === 'advance' ? 'in' : 'out'}`}>
                  {a.kind === 'advance' ? '+' : '−'}
                  {formatVnd(a.amount)}
                </span>
              </span>
            </div>
          ))}
      </div>
      <p>
        <button
          type="button"
          className="danger-outline"
          onClick={async () => {
            if (!window.confirm(`Rời doanh nghiệp ${business.name}? Phiếu cũ vẫn thuộc doanh nghiệp.`)) return
            await api.leaveBusiness(token)
            onLeft()
          }}
        >
          Rời doanh nghiệp
        </button>
      </p>
    </div>
  )
}

/** Lái: giá mua tối đa chủ chốt hôm nay */
function TodayPrices({ token, mode }: { token: string; mode: PriceMode }) {
  const [state] = useAsync(() => api.buyPrices(token), [token])
  if (state.status !== 'ok' || state.data.items.length === 0) return null
  return (
    <section className="card">
      <h2>💰 Giá mua chủ chốt hôm nay</h2>
      <p className="small muted">{mode === 'block' ? 'Mua cao hơn giá này thì không lập phiếu được.' : 'Mua cao hơn giá này thì phiếu bị đánh dấu và báo chủ.'}</p>
      <LimitTable items={state.data.items} />
    </section>
  )
}

function LimitTable({ items }: { items: BuyPriceLimit[] }) {
  return (
    <table className="trade-table">
      <thead>
        <tr>
          <th>Hàng</th>
          <th className="num">Giá tối đa</th>
          <th className="num">Ngày chốt</th>
        </tr>
      </thead>
      <tbody>
        {items.map((l) => (
          <tr key={l.product_code}>
            <td>{l.name}</td>
            <td className="num">
              <b>{formatVnd(l.max_price)}</b>/{l.unit}
            </td>
            <td className="num">{formatDate(l.date, true)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/**
 * Chủ chốt giá mua tối đa cho lái theo ngày: để trống = không giới hạn. Ngày chưa chốt thì dùng lần chốt gần nhất trước đó.
 * Chế độ: cảnh báo (vẫn lập phiếu, báo chủ) hoặc chặn.
 */
function BuyPrices({ token }: { token: string }) {
  const [date, setDate] = useState(today())
  const [state, retry] = useAsync(() => api.buyPrices(token, date), [token, date])
  const [categories] = useAsync(() => api.categories(), [])
  const [draft, setDraft] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)

  if (state.status !== 'ok') return <Status state={state} retry={retry} />
  const board = state.data
  const current = Object.fromEntries(board.items.map((l) => [l.product_code, l.max_price]))
  const products = categories.status === 'ok' ? categories.data.filter((c) => c.type === 'nong_san').flatMap((c) => c.products.map((p) => ({ ...p, group: c.name }))) : []
  const valueOf = (code: string) => draft[code] ?? current[code] ?? 0
  const changed = Object.entries(draft).filter(([code, v]) => v !== (current[code] ?? 0))

  const save = async (input: Parameters<typeof api.saveBuyPrices>[1], message: string) => {
    setSaving(true)
    try {
      await api.saveBuyPrices(token, { date, ...input })
      setDraft({})
      showToast({ message })
      retry()
    } catch (err) {
      showToast({ message: errorText(err) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <section className="card form">
        <p className="small muted">Giá mua tối đa lái được trả cho nông dân. Ngày nào chưa chốt thì dùng giá chốt gần nhất trước đó. Chốt xong các lái nhận thông báo.</p>
        <DateField label="Chốt giá cho ngày" value={date} onChange={(d) => (setDate(d), setDraft({}))} />
        <fieldset>
          <legend>Khi lái mua cao hơn giá chốt</legend>
          <div className="segmented wrap">
            {(['warn', 'block'] as const).map((m) => (
              <button key={m} type="button" className={board.mode === m ? 'active' : ''} aria-pressed={board.mode === m} disabled={saving} onClick={() => board.mode !== m && save({ mode: m }, 'Đã đổi cách xử lý')}>
                {PRICE_MODE_LABELS[m]}
              </button>
            ))}
          </div>
        </fieldset>
      </section>
      <form
        className="card form"
        onSubmit={(e) => {
          e.preventDefault()
          void save({ items: changed.map(([product_code, v]) => ({ product_code, max_price: v > 0 ? v : null })) }, `Đã chốt giá ngày ${formatDate(date)}`)
        }}
      >
        <h2>Giá chốt ngày {formatDate(date)}</h2>
        {products.map((p) => (
          <div key={p.code}>
            <MoneyField label={`${p.group} · ${p.name} (đ/${p.unit})`} value={valueOf(p.code)} onChange={(v) => setDraft({ ...draft, [p.code]: v })} />
            {current[p.code] && board.items.find((l) => l.product_code === p.code)?.date !== date && (
              <span className="small muted">Đang dùng giá chốt ngày {formatDate(board.items.find((l) => l.product_code === p.code)!.date)}</span>
            )}
          </div>
        ))}
        <p className="small muted">Để trống (0) = không giới hạn mặt hàng đó từ ngày này.</p>
        <button type="submit" className="wide primary" disabled={saving || changed.length === 0}>
          {saving ? 'Đang lưu…' : `Chốt giá (${changed.length} mặt hàng)`}
        </button>
      </form>
      {board.recent.length > 0 && (
        <section className="card">
          <h2>Các lần chốt gần đây</h2>
          <table className="trade-table">
            <tbody>
              {board.recent.map((r, i) => (
                <tr key={i}>
                  <td>{formatDate(r.date, true)}</td>
                  <td>{r.name}</td>
                  <td className="num">{r.max_price ? formatVnd(r.max_price) : 'Bỏ giới hạn'}</td>
                  <td className="small muted">{r.set_by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  )
}

function Overview({ token }: { token: string }) {
  const range = useRange()
  const [state, retry] = useAsync(() => api.businessSummary(token, { from: range.from, to: range.to }), [token, range.from, range.to])
  return (
    <>
      <section className="card form">
        <RangeFields range={range} />
      </section>
      <Status state={state} retry={retry} />
      {state.status === 'ok' && (
        <>
          <TotalsCard totals={state.data.data.totals} />
          <p className="small">
            Tiền các lái đang giữ: <b>{formatVnd(state.data.data.totals.holding)}</b>
          </p>
          <h2 className="section">Từng lái</h2>
          <div className="garden-list">
            {state.data.data.members.map((m) => (
              <a key={m.id} className="card garden-row" href={href('doanh-nghiep', { tab: 'so', lai: String(m.id) })}>
                <span className="garden-name">
                  {m.role === 'owner' ? '👑' : '🧑‍🌾'} {m.name}
                  <span className="small muted">
                    {m.group_name ? ` · ${m.group_name}` : ''} · {m.totals.count} giao dịch · mua {formatKg(m.totals.buy.kg)} kg
                  </span>
                  {m.status === 'locked' && <span className="tag overdue">Đã khóa</span>}
                  {m.totals.buy.owing > 0 && <span className="tag overdue">Còn nợ người bán {formatVnd(m.totals.buy.owing)}</span>}
                  {m.role !== 'owner' && <span className="tag">Đang giữ {formatVnd(m.cash.holding)}</span>}
                </span>
                <span className="profit">{formatVnd(m.totals.buy.amount)}</span>
              </a>
            ))}
          </div>
          {(['buy', 'sell'] as TradeKind[]).map((kind) => {
            const products = state.data.data.products.filter((p) => p.kind === kind)
            return products.length === 0 ? null : (
              <section key={kind} className="card">
                <h2>{TRADE_KIND_LABELS[kind]} theo mặt hàng</h2>
                <table className="trade-table">
                  <thead>
                    <tr>
                      <th>Hàng</th>
                      <th className="num">Kg</th>
                      <th className="num">Giá bình quân</th>
                      <th className="num">Tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((p) => (
                      <tr key={p.name}>
                        <td>{p.name}</td>
                        <td className="num">{formatKg(p.kg)}</td>
                        <td className="num">{p.kg > 0 ? formatVnd(Math.round(p.amount / p.kg)) : ''}</td>
                        <td className="num">{formatVnd(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )
          })}
          <section className="card">
            <PrintButtons token={token} target={{ type: 'business-report', from: range.from, to: range.to }} label="Báo cáo doanh nghiệp: từng lái (mua, bán, còn nợ, tiền ứng, đang giữ), mặt hàng, chi tiết" />
          </section>
        </>
      )}
    </>
  )
}

function Members({ token, business, onChange }: { token: string; business: Business; onChange: () => void }) {
  const [adding, setAdding] = useState(false)
  const members = business.members ?? []
  const act = async (action: () => Promise<unknown>, message: string) => {
    try {
      await action()
      showToast({ message })
      onChange()
    } catch (err) {
      showToast({ message: errorText(err) })
    }
  }
  const shareInvite = async () => {
    const text = businessInviteText(business, business.invite_code!)
    try {
      if (navigator.share) await navigator.share({ title: business.name, text })
      else {
        await navigator.clipboard.writeText(text)
        showToast({ message: 'Đã chép lời mời kèm mã, dán vào Zalo để gửi lái.' })
      }
    } catch {
      // Người dùng hủy chia sẻ
    }
  }

  return (
    <>
      <section className="card">
        <h2>Thêm lái</h2>
        <p className="small muted">Cách 1: tạo tài khoản cho lái (SĐT + mật khẩu), đưa lái đăng nhập. Cách 2: lái đã có tài khoản thì gửi mã mời.</p>
        <div className="btn-row">
          <button type="button" className="primary" onClick={() => setAdding(!adding)}>
            {adding ? 'Thôi' : '＋ Tạo tài khoản lái'}
          </button>
          {business.invite_code ? (
            <>
              <button type="button" onClick={shareInvite}>
                📤 Gửi mã mời {business.invite_code}
              </button>
              <button type="button" className="danger-outline" onClick={() => act(() => api.revokeBusinessInvite(token), 'Đã thu hồi mã mời')}>
                Thu hồi mã
              </button>
            </>
          ) : (
            <button type="button" onClick={() => act(() => api.businessInvite(token), 'Đã tạo mã mời')}>
              🔑 Tạo mã mời
            </button>
          )}
        </div>
        {business.invite_code && <p className="code">{business.invite_code}</p>}
      </section>
      {adding && (
        <MemberForm
          token={token}
          groups={[...new Set(members.map((m) => m.group_name).filter((g): g is string => !!g))]}
          onSaved={() => {
            setAdding(false)
            onChange()
          }}
        />
      )}
      <div className="garden-list">
        {members.map((m) => (
          <MemberRow key={m.id} member={m} token={token} act={act} />
        ))}
      </div>
    </>
  )
}

function MemberForm({ token, groups, onSaved }: { token: string; groups: string[]; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [group, setGroup] = useState('')
  const [error, setError] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await api.createMember(token, { name: name.trim(), phone: phone.trim(), password, group_name: group.trim() || null })
      showToast({ message: `Đã tạo tài khoản cho ${name.trim()}. Đưa lái SĐT + mật khẩu để đăng nhập.` })
      onSaved()
    } catch (err) {
      setError(errorText(err))
    }
  }
  return (
    <form className="card form" onSubmit={submit}>
      <label>
        Tên lái *
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} placeholder="Ví dụ: Lái Tèo" />
      </label>
      <label>
        Số điện thoại (để đăng nhập) *
        <input value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" maxLength={20} />
      </label>
      <label>
        Mật khẩu ban đầu *
        <input value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} maxLength={100} placeholder="Ít nhất 6 ký tự" />
      </label>
      <label>
        Nhóm (không bắt buộc)
        <input value={group} onChange={(e) => setGroup(e.target.value)} list="business-groups" maxLength={80} placeholder="Ví dụ: Nhóm Krông Pắc" />
        <datalist id="business-groups">
          {groups.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
      </label>
      {error && <div className="notice error">{error}</div>}
      <button type="submit" className="wide primary" disabled={!name.trim() || !phone.trim() || password.length < 6}>
        Tạo tài khoản
      </button>
    </form>
  )
}

function MemberRow({ member: m, token, act }: { member: BusinessMemberInfo; token: string; act: (action: () => Promise<unknown>, message: string) => Promise<void> }) {
  const owner = m.role === 'owner'
  return (
    <section className="card">
      <p>
        <b>
          {owner ? '👑' : '🧑‍🌾'} {m.name}
        </b>
        <span className="small muted">
          {' '}
          · {m.phone}
          {m.group_name ? ` · ${m.group_name}` : ''}
          {owner ? ' · chủ' : m.created_by_owner ? ' · chủ tạo tài khoản' : ' · vào bằng mã mời'}
        </span>
        {m.status === 'locked' && <span className="tag overdue">Đã khóa</span>}
      </p>
      <div className="btn-row">
        <a className="button" href={href('doanh-nghiep', { tab: 'so', lai: String(m.id) })}>
          Giao dịch
        </a>
        {!owner && (
          <>
            <a className="button" href={href('doanh-nghiep', { tab: 'tien-ung', lai: String(m.id) })}>
              Tiền ứng
            </a>
            <button
              type="button"
              onClick={() => {
                const group = window.prompt('Nhóm của lái (để trống: không nhóm)', m.group_name ?? '')
                if (group !== null) void act(() => api.updateMember(token, m.id, { group_name: group.trim() || null }), 'Đã đổi nhóm')
              }}
            >
              Đổi nhóm
            </button>
            {m.created_by_owner && (
              <button
                type="button"
                onClick={() => {
                  const password = window.prompt(`Mật khẩu mới cho ${m.name} (ít nhất 6 ký tự)`)
                  if (password) void act(() => api.updateMember(token, m.id, { password }), `Đã đặt lại mật khẩu cho ${m.name}`)
                }}
              >
                Đặt lại mật khẩu
              </button>
            )}
            {m.status === 'active' ? (
              <button
                type="button"
                className="danger-outline"
                onClick={() => window.confirm(`Khóa ${m.name}? Lái bị đăng xuất, không lập phiếu / đơn mới được.`) && act(() => api.updateMember(token, m.id, { status: 'locked' }), `Đã khóa ${m.name}`)}
              >
                Khóa
              </button>
            ) : (
              <button type="button" onClick={() => act(() => api.updateMember(token, m.id, { status: 'active' }), `Đã mở khóa ${m.name}`)}>
                Mở khóa
              </button>
            )}
            <button
              type="button"
              className="danger-outline"
              onClick={() => window.confirm(`Gỡ ${m.name} khỏi doanh nghiệp? Phiếu, đơn, tiền ứng cũ vẫn giữ trong doanh nghiệp.`) && act(() => api.removeMember(token, m.id), `Đã gỡ ${m.name}`)}
            >
              Gỡ
            </button>
          </>
        )}
      </div>
    </section>
  )
}

function Advances({ token, business, initialMember }: { token: string; business: Business; initialMember?: number }) {
  const buyers = (business.members ?? []).filter((m) => m.role !== 'owner')
  const [member, setMember] = useState<number | undefined>(initialMember)
  const [kind, setKind] = useState<AdvanceKind>('advance')
  const [amount, setAmount] = useState(0)
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const [cash, setCash] = useState<MemberCash | null>(null)
  const [state, retry] = useAsync(() => api.businessAdvances(token, member), [token, member])
  const name = buyers.find((m) => m.id === member)?.name

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!member) return
    try {
      const result = await api.createAdvance(token, { member, kind, amount, date, note: note.trim() || null })
      setCash(result.cash)
      setAmount(0)
      setNote('')
      showToast({ message: `Đã ghi: ${ADVANCE_KIND_LABELS[kind].toLowerCase()} ${formatVnd(result.data.amount)}` })
      retry()
    } catch (err) {
      showToast({ message: errorText(err) })
    }
  }

  return (
    <>
      <form className="card form" onSubmit={submit}>
        <label>
          Lái
          <select value={member ?? ''} onChange={(e) => (setMember(Number(e.target.value) || undefined), setCash(null))}>
            <option value="">Tất cả lái (xem)</option>
            {buyers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.group_name ? ` · ${m.group_name}` : ''}
              </option>
            ))}
          </select>
        </label>
        {member && (
          <>
            <div className="segmented">
              {(['advance', 'return'] as const).map((k) => (
                <button key={k} type="button" className={k === kind ? 'active' : ''} aria-pressed={k === kind} onClick={() => setKind(k)}>
                  {ADVANCE_KIND_LABELS[k]}
                </button>
              ))}
            </div>
            <MoneyField label="Số tiền *" value={amount} onChange={setAmount} required />
            <DateField label="Ngày" value={date} onChange={setDate} max={today()} />
            <label>
              Ghi chú
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={255} placeholder="Ví dụ: ứng mua cà phê Krông Pắc" />
            </label>
            <button type="submit" className="wide primary" disabled={amount <= 0}>
              Ghi {ADVANCE_KIND_LABELS[kind].toLowerCase()}
            </button>
          </>
        )}
      </form>
      {cash && name && <CashCard cash={cash} title={`${name} đang giữ`} />}
      <Status state={state} retry={retry} />
      {state.status === 'ok' && state.data.data.length === 0 && <p className="muted">Chưa có lần ứng nào.</p>}
      <div className="entries">
        {state.status === 'ok' &&
          state.data.data.map((a) => (
            <div key={a.id} className="entry">
              <span className="entry-main">
                <span className="entry-text">
                  <span>
                    {ADVANCE_KIND_LABELS[a.kind]} · {a.member.name}
                  </span>
                  <span className="small muted">
                    {formatDate(a.date)}
                    {a.note ? ` · ${a.note}` : ''}
                  </span>
                </span>
                <span className={`amount ${a.kind === 'advance' ? 'out' : 'in'}`}>{formatVnd(a.amount)}</span>
              </span>
              <button
                type="button"
                className="entry-del"
                aria-label="Xóa"
                onClick={async () => {
                  if (!window.confirm('Xóa lần ghi này?')) return
                  await api.deleteAdvance(token, a.id)
                  retry()
                }}
              >
                🗑
              </button>
            </div>
          ))}
      </div>
    </>
  )
}

function BusinessTrades({ token, business, initialMember }: { token: string; business: Business; initialMember?: number }) {
  const range = useRange()
  const [member, setMember] = useState<number | undefined>(initialMember)
  const [kind, setKind] = useState<TradeKind | ''>('')
  const [state, retry] = useAsync(() => api.businessTransactions(token, { from: range.from, to: range.to, member, kind: kind || undefined }), [token, range.from, range.to, member, kind])
  return (
    <>
      <section className="card form">
        <RangeFields range={range} />
        <label>
          Lái
          <select value={member ?? ''} onChange={(e) => setMember(Number(e.target.value) || undefined)}>
            <option value="">Tất cả</option>
            {(business.members ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.group_name ? ` · ${m.group_name}` : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="segmented">
          {(['', 'buy', 'sell'] as const).map((k) => (
            <button key={k} type="button" className={k === kind ? 'active' : ''} aria-pressed={k === kind} onClick={() => setKind(k)}>
              {k ? TRADE_KIND_LABELS[k] : 'Tất cả'}
            </button>
          ))}
        </div>
      </section>
      <Status state={state} retry={retry} />
      {state.status === 'ok' && (
        <>
          <TotalsCard totals={state.data.meta.totals} />
          {state.data.data.length === 0 && <p className="muted">Chưa có giao dịch.</p>}
          <div className="garden-list">
            {state.data.data.map((r) => (
              <TradeRowCard key={r.id} row={r} />
            ))}
          </div>
        </>
      )}
    </>
  )
}

function BusinessDeals({ token }: { token: string }) {
  const [state, retry] = useAsync(() => api.businessDeals(token), [token])
  return (
    <>
      <p className="small muted">Đơn chung các lái làm với nông dân (cọc, nhiều đợt cân). Chủ mở xem được từng đơn (chỉ xem) và tải bảng quyết toán; lái là người ghi / xác nhận trong đơn.</p>
      <Status state={state} retry={retry} />
      {state.status === 'ok' && state.data.length === 0 && <p className="muted">Chưa có đơn chung.</p>}
      {state.status === 'ok' &&
        state.data.map((d) => (
          <section key={d.uuid} className="card">
            <p>
              <b>
                {d.kind === 'buy' ? '🛒' : '🌳'} {d.title}
              </b>
              <span className="small muted">
                {' '}
                · lái {d.member.name} · {d.kind === 'buy' ? 'mua của' : 'bán cho'} {d.counterpart} · mã {d.code}
              </span>
              {d.status !== 'open' && <span className="tag">{d.status === 'done' ? 'Đã xong' : 'Đã hủy'}</span>}
            </p>
            <dl className="deal-totals">
              <div>
                <dt>Tiền hàng ({formatKg(d.totals.kg)} kg)</dt>
                <dd>{formatVnd(d.totals.delivered)}</dd>
              </div>
              <div>
                <dt>Cọc · đã trả</dt>
                <dd>
                  {formatVnd(d.totals.deposit)} · {formatVnd(d.totals.paid)}
                </dd>
              </div>
              <div>
                <dt>{d.totals.balance >= 0 ? 'Bên mua còn phải trả' : 'Bên bán nhận dư'}</dt>
                <dd>{formatVnd(Math.abs(d.totals.balance))}</dd>
              </div>
            </dl>
            <p>
              <a className="button" href={href(`don/${d.uuid}`)}>
                👁 Mở đơn (chỉ xem)
              </a>
            </p>
            <PrintButtons token={token} target={{ type: 'deal', id: d.uuid }} label="" />
          </section>
        ))}
    </>
  )
}

