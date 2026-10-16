import {
  ApiError,
  formatDate,
  formatDateTime,
  formatKg,
  formatVnd,
  itemsText,
  kgInputText,
  monthStart,
  parseKgText,
  purchaseShareText,
  purchaseTotals,
  telHref,
  today,
  TRADE_KIND_LABELS,
  type Category,
  type Purchase,
  type PurchaseHistoryItem,
  type PurchaseLineInput,
  type TradeCustomer,
  type TradeKind,
  type TradeRow,
  type TradeTotals,
} from '@nhanong/shared'
import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../../api'
import { useAuth } from '../../auth'
import { dealWatcher } from '../../dealWatch'
import { DateField } from '../../components/DateField'
import { PrintButtons } from '../../components/PrintButtons'
import { Status } from '../../components/Status'
import { go, href, replaceQuery, useAsync } from '../../hooks'
import { showToast } from '../../ledger/toast'
import { MoneyField, QtyField } from '../ledger/fields'

/**
 * #/giao-dich/...: sổ giao dịch của điểm thu mua / thương lái (tải riêng).
 * #/giao-dich?tab=so|khach|bao-cao, #/giao-dich/moi?loai=buy|sell&khach=, #/giao-dich/phieu/:uuid(/sua), #/giao-dich/khach/:uuid,
 * #/giao-dich/nhan/:uuid (phiếu người khác gửi cho mình, chỉ xem)
 */
export default function TradeRoutes({ path, query }: { path: string[]; query: URLSearchParams }) {
  const auth = useAuth()
  const [, page, id, action] = path

  if (!auth)
    return (
      <div className="ledger">
        <h1>📒 Sổ giao dịch</h1>
        <div className="notice upgrade">
          <p>Dành cho điểm thu mua, thương lái: ghi phiếu mua / bán, theo dõi khách nợ, in phiếu PDF / Word gửi khách. Cần đăng nhập để dùng.</p>
          <a className="button primary" href={href('tai-khoan', { ve: path.join('/') })}>
            Đăng nhập / Đăng ký
          </a>
        </div>
      </div>
    )

  if (page === 'moi') return <PurchaseForm key={`new-${query.get('loai')}`} token={auth.token} kind={query.get('loai') === 'sell' ? 'sell' : 'buy'} customerId={query.get('khach')} />
  if (page === 'phieu' && id && action === 'sua') return <PurchaseEdit token={auth.token} id={id} />
  if (page === 'phieu' && id) return <PurchaseView key={id} token={auth.token} id={id} />
  if (page === 'khach' && id) return <CustomerView key={id} token={auth.token} id={id} />
  if (page === 'nhan' && id) return <ReceivedView key={id} token={auth.token} id={id} />
  return <TradeHome token={auth.token} query={query} />
}

type Tab = 'so' | 'khach' | 'bao-cao'

function TradeHome({ token, query }: { token: string; query: URLSearchParams }) {
  const tab = (['so', 'khach', 'bao-cao'].includes(query.get('tab') ?? '') ? query.get('tab') : 'so') as Tab
  return (
    <div className="ledger">
      <h1>📒 Sổ giao dịch</h1>
      <p className="small muted">Phiếu mua / bán với khách (không cần khách có app) và các đợt cân của đơn mua bán. In phiếu, bảng kê ra PDF / Word để gửi khách.</p>
      <div className="btn-row">
        <a className="button primary" href={href('giao-dich/moi', { loai: 'buy' })}>
          ＋ Phiếu mua
        </a>
        <a className="button" href={href('giao-dich/moi', { loai: 'sell' })}>
          ＋ Phiếu bán
        </a>
      </div>
      <nav className="segmented" aria-label="Mục">
        {(
          [
            ['so', 'Giao dịch'],
            ['khach', 'Khách hàng'],
            ['bao-cao', 'Báo cáo'],
          ] as const
        ).map(([key, label]) => (
          <button key={key} type="button" className={tab === key ? 'active' : ''} aria-pressed={tab === key} onClick={() => replaceQuery('giao-dich', { tab: key })}>
            {label}
          </button>
        ))}
      </nav>
      {tab === 'so' && <TradeList token={token} />}
      {tab === 'khach' && <CustomerList token={token} />}
      {tab === 'bao-cao' && <TradeReport token={token} />}
    </div>
  )
}

/** Khoảng ngày: mặc định đầu tháng → hôm nay */
function useRange() {
  const [from, setFrom] = useState(monthStart(today()))
  const [to, setTo] = useState(today())
  return { from, to, setFrom, setTo }
}

function RangeFields({ range }: { range: ReturnType<typeof useRange> }) {
  return (
    <div className="range-fields">
      <DateField label="Từ ngày" value={range.from} onChange={range.setFrom} max={range.to} />
      <DateField label="Đến ngày" value={range.to} onChange={range.setTo} min={range.from} max={today()} />
    </div>
  )
}

function TradeList({ token }: { token: string }) {
  const range = useRange()
  const [kind, setKind] = useState<TradeKind | ''>('')
  const [q, setQ] = useState('')
  const [state, retry] = useAsync(() => api.transactions(token, { from: range.from, to: range.to, kind: kind || undefined, q: q.trim() || undefined }), [token, range.from, range.to, kind, q])

  return (
    <>
      <section className="card form">
        <RangeFields range={range} />
        <div className="segmented">
          {(['', 'buy', 'sell'] as const).map((k) => (
            <button key={k} type="button" className={k === kind ? 'active' : ''} aria-pressed={k === kind} onClick={() => setKind(k)}>
              {k ? TRADE_KIND_LABELS[k] : 'Tất cả'}
            </button>
          ))}
        </div>
        <label>
          Tìm
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tên khách, số phiếu, mặt hàng" />
        </label>
      </section>
      <Status state={state} retry={retry} />
      {state.status === 'ok' && (
        <>
          <TotalsCard totals={state.data.meta.totals} />
          {state.data.data.length === 0 && <p className="muted">Chưa có giao dịch trong khoảng ngày này.</p>}
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

function TotalsCard({ totals }: { totals: TradeTotals }) {
  return (
    <section className="card">
      <dl className="deal-totals">
        <div>
          <dt>Mua vào ({formatKg(totals.buy.kg)} kg)</dt>
          <dd>{formatVnd(totals.buy.amount)}</dd>
        </div>
        {totals.buy.owing > 0 && (
          <div>
            <dt>Còn nợ khách</dt>
            <dd className="out">{formatVnd(totals.buy.owing)}</dd>
          </div>
        )}
        <div>
          <dt>Bán ra ({formatKg(totals.sell.kg)} kg)</dt>
          <dd>{formatVnd(totals.sell.amount)}</dd>
        </div>
        {totals.sell.owing > 0 && (
          <div>
            <dt>Khách còn nợ mình</dt>
            <dd className="in">{formatVnd(totals.sell.owing)}</dd>
          </div>
        )}
      </dl>
      <p className="small muted">{totals.count} giao dịch</p>
    </section>
  )
}

function TradeRowCard({ row: r }: { row: TradeRow }) {
  const link = r.source === 'deal' && r.deal ? href(`don/${r.deal}`) : href(`giao-dich/phieu/${r.id}`)
  return (
    <a className="card garden-row trade-row" href={link}>
      <span className="garden-name">
        {r.kind === 'buy' ? '🛒' : '📦'} {r.counterpart}
        <span className="small muted">
          {' '}
          · {formatDate(r.date, true)} · {r.code}
        </span>
        <br />
        <span className="small">{itemsText(r.items)}</span>
        {r.owing > 0 && <span className="tag overdue">{r.kind === 'buy' ? 'Còn nợ khách' : 'Khách nợ'} {formatVnd(r.owing)}</span>}
        {r.pending && <span className="tag">Chờ bên kia xác nhận</span>}
      </span>
      <span className="profit">{formatVnd(r.amount)}</span>
    </a>
  )
}

function CustomerList({ token }: { token: string }) {
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)
  const [state, retry] = useAsync(() => api.customers(token, q.trim() || undefined), [token, q])

  return (
    <>
      <div className="btn-row">
        <label className="grow">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm tên hoặc SĐT" aria-label="Tìm khách" />
        </label>
        <button type="button" onClick={() => setAdding(!adding)}>
          {adding ? 'Thôi' : '＋ Thêm khách'}
        </button>
      </div>
      {adding && (
        <CustomerForm
          token={token}
          onSaved={(c) => {
            setAdding(false)
            go(`giao-dich/khach/${c.id}`)
          }}
        />
      )}
      <Status state={state} retry={retry} />
      {state.status === 'ok' && state.data.length === 0 && <p className="muted">Chưa có khách. Lập phiếu đầu tiên, khách sẽ tự được lưu vào đây.</p>}
      <div className="garden-list">
        {state.status === 'ok' &&
          state.data.map((c) => (
            <a key={c.id} className="card garden-row" href={href(`giao-dich/khach/${c.id}`)}>
              <span className="garden-name">
                👤 {c.name}
                <span className="small muted">
                  {c.phone ? ` · ${c.phone}` : ''} · {c.count} phiếu{c.last_date ? ` · lần cuối ${formatDate(c.last_date, true)}` : ''}
                </span>
                {c.i_owe > 0 && <span className="tag overdue">Mình còn nợ {formatVnd(c.i_owe)}</span>}
                {c.owes_me > 0 && <span className="tag">Khách nợ {formatVnd(c.owes_me)}</span>}
              </span>
              <span className="profit">{formatVnd(c.bought + c.sold)}</span>
            </a>
          ))}
      </div>
    </>
  )
}

function CustomerForm({ token, customer, onSaved }: { token: string; customer?: TradeCustomer; onSaved: (c: TradeCustomer) => void }) {
  const [name, setName] = useState(customer?.name ?? '')
  const [phone, setPhone] = useState(customer?.phone ?? '')
  const [address, setAddress] = useState(customer?.address ?? '')
  const [note, setNote] = useState(customer?.note ?? '')
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      onSaved(await api.saveCustomer(token, { name: name.trim(), phone: phone.trim() || null, address: address.trim() || null, note: note.trim() || null }, customer?.id))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <form className="card form" onSubmit={submit}>
      <label>
        Tên khách *
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} placeholder="Ví dụ: Chú Năm Lộc" />
      </label>
      <label>
        Số điện thoại
        <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={20} />
      </label>
      <label>
        Địa chỉ
        <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={255} placeholder="Thôn, xã" />
      </label>
      <label>
        Ghi chú
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={255} />
      </label>
      {error && <div className="notice error">{error}</div>}
      <button type="submit" className="wide primary" disabled={!name.trim()}>
        Lưu khách
      </button>
    </form>
  )
}

function TradeReport({ token }: { token: string }) {
  const range = useRange()
  const [state, retry] = useAsync(() => api.transactions(token, { from: range.from, to: range.to }), [token, range.from, range.to])
  // Gộp theo mặt hàng (mua vào / bán ra) để xem nhanh trước khi in
  const byProduct = (kind: TradeKind) => {
    const map = new Map<string, { kg: number; amount: number }>()
    if (state.status === 'ok')
      for (const r of state.data.data.filter((x) => x.kind === kind))
        for (const i of r.items) {
          const cur = map.get(i.name) ?? { kg: 0, amount: 0 }
          map.set(i.name, { kg: cur.kg + i.kg, amount: cur.amount + i.amount })
        }
    return [...map.entries()].sort((a, b) => b[1].amount - a[1].amount)
  }

  return (
    <>
      <section className="card form">
        <RangeFields range={range} />
      </section>
      <Status state={state} retry={retry} />
      {state.status === 'ok' && (
        <>
          <TotalsCard totals={state.data.meta.totals} />
          {(['buy', 'sell'] as const).map((kind) => {
            const rows = byProduct(kind)
            return rows.length === 0 ? null : (
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
                    {rows.map(([name, v]) => (
                      <tr key={name}>
                        <td>{name}</td>
                        <td className="num">{formatKg(v.kg)}</td>
                        <td className="num">{v.kg > 0 ? formatVnd(Math.round(v.amount / v.kg)) : ''}</td>
                        <td className="num">{formatVnd(v.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )
          })}
          <section className="card">
            <PrintButtons token={token} target={{ type: 'report', from: range.from, to: range.to }} label="Báo cáo đầy đủ (theo mặt hàng, theo khách, chi tiết từng giao dịch)" />
          </section>
        </>
      )}
    </>
  )
}

/** Dòng hàng đang nhập: giữ chữ người dùng gõ cho kg (để gõ được "1250,5") */
interface LineDraft {
  product_code: string
  name: string
  kg: string
  deduct: string
  price: number
}

function PurchaseEdit({ token, id }: { token: string; id: string }) {
  const [state, retry] = useAsync(() => api.purchase(token, id), [token, id])
  if (state.status !== 'ok') return <Status state={state} retry={retry} />
  return <PurchaseForm token={token} kind={state.data.kind} purchase={state.data} />
}

function PurchaseForm({ token, kind: initialKind, customerId, purchase }: { token: string; kind: TradeKind; customerId?: string | null; purchase?: Purchase }) {
  const [kind, setKind] = useState<TradeKind>(purchase?.kind ?? initialKind)
  const [customers] = useAsync(() => api.customers(token), [token])
  const [categories] = useAsync(() => api.categories(), [])
  const [customer, setCustomer] = useState<string | null>(purchase?.customer ?? customerId ?? null)
  const [name, setName] = useState(purchase?.counterpart ?? '')
  const [phone, setPhone] = useState(purchase?.phone ?? '')
  const [date, setDate] = useState(purchase?.date ?? today())
  const [lines, setLines] = useState<LineDraft[]>(
    purchase?.lines.map((l) => ({ product_code: l.product_code ?? '', name: l.name, kg: kgInputText(l.kg), deduct: kgInputText(l.deduct_kg), price: l.price })) ?? [{ product_code: '', name: '', kg: '', deduct: '', price: 0 }],
  )
  const [paid, setPaid] = useState(purchase?.paid ?? 0)
  const [note, setNote] = useState(purchase?.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const list = customers.status === 'ok' ? customers.data : []
  const chosen = list.find((c) => c.id === customer) ?? null
  const shownName = chosen?.name ?? name
  const products = categories.status === 'ok' ? categories.data.flatMap((c: Category) => c.products.map((p) => ({ ...p, group: c.name }))) : []
  const inputs: PurchaseLineInput[] = lines.map((l) => ({ product_code: l.product_code || null, name: l.name.trim(), kg: parseKgText(l.kg), deduct_kg: parseKgText(l.deduct), price: l.price }))
  const totals = purchaseTotals(inputs)

  const setLine = (i: number, patch: Partial<LineDraft>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const onName = (text: string) => {
    // Gõ đúng tên khách đã có thì chọn luôn khách đó (điền SĐT)
    const match = list.find((c) => c.name.toLowerCase() === text.trim().toLowerCase())
    setCustomer(match?.id ?? null)
    setName(text)
    if (match) setPhone(match.phone ?? '')
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSending(true)
    setError(null)
    try {
      const saved = await api.savePurchase(
        token,
        {
          ...(purchase ? {} : { kind }),
          customer: chosen?.id ?? null,
          customer_name: chosen ? null : name.trim(),
          customer_phone: chosen ? null : phone.trim() || null,
          date,
          lines: inputs,
          paid,
          note: note.trim() || null,
        },
        purchase?.id,
      )
      showToast({ message: purchase ? 'Đã lưu phiếu' : `Đã lập phiếu ${saved.code}` })
      go(`giao-dich/phieu/${saved.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? Object.values(err.errors)[0]?.[0] ?? err.message : (err as Error).message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="ledger">
      <a className="back" href={purchase ? href(`giao-dich/phieu/${purchase.id}`) : href('giao-dich')}>
        ‹ {purchase ? `Phiếu ${purchase.code}` : 'Sổ giao dịch'}
      </a>
      <h1>{purchase ? `Sửa phiếu ${purchase.code}` : kind === 'buy' ? '🛒 Phiếu mua hàng' : '📦 Phiếu bán hàng'}</h1>
      {purchase?.shared_version != null && (
        <div className="notice upgrade">Phiếu đã gửi cho khách. Lần sửa này được lưu thành bản mới, khách thấy cả bản cũ và bản mới (đổi gì, lúc nào).</div>
      )}
      <form className="form card" onSubmit={submit}>
        {!purchase && (
          <div className="segmented">
            {(['buy', 'sell'] as const).map((k) => (
              <button key={k} type="button" className={k === kind ? 'active' : ''} aria-pressed={k === kind} onClick={() => setKind(k)}>
                {k === 'buy' ? 'Mua vào (khách bán cho mình)' : 'Bán ra (mình bán cho khách)'}
              </button>
            ))}
          </div>
        )}
        <label>
          {kind === 'buy' ? 'Người bán (khách) *' : 'Người mua (khách) *'}
          <input value={shownName} onChange={(e) => onName(e.target.value)} list="trade-customers" required maxLength={120} placeholder="Gõ tên, chọn khách cũ hoặc nhập khách mới" />
          <datalist id="trade-customers">
            {list.map((c) => (
              <option key={c.id} value={c.name}>
                {c.phone ?? ''}
              </option>
            ))}
          </datalist>
          {chosen ? <span className="small muted">Khách quen{chosen.phone ? ` · ${chosen.phone}` : ''}</span> : name.trim() && <span className="small muted">Khách mới, sẽ tự lưu vào sổ khách</span>}
        </label>
        {!chosen && (
          <label>
            Số điện thoại khách
            <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={20} />
          </label>
        )}
        <DateField label="Ngày" value={date} onChange={setDate} max={today()} />

        <fieldset>
          <legend>Hàng</legend>
          {lines.map((l, i) => {
            const computed = totals.lines[i]
            return (
              <div key={i} className="trade-line">
                <label>
                  Mặt hàng
                  <select
                    value={l.product_code}
                    onChange={(e) => {
                      const p = products.find((x) => x.code === e.target.value)
                      setLine(i, { product_code: e.target.value, name: p ? p.name : l.name })
                    }}
                  >
                    <option value="">Hàng khác (tự gõ tên)</option>
                    {products.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.group} · {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Tên hàng trên phiếu *
                  <input value={l.name} onChange={(e) => setLine(i, { name: e.target.value })} required maxLength={120} placeholder="Ví dụ: Cà phê nhân xô" />
                </label>
                <div className="range-fields">
                  <QtyField label="Cân (kg) *" text={l.kg} onText={(t) => setLine(i, { kg: t })} suffix="kg" />
                  <QtyField label="Trừ bì / tạp chất" text={l.deduct} onText={(t) => setLine(i, { deduct: t })} suffix="kg" />
                </div>
                <MoneyField label="Đơn giá (đ/kg tịnh) *" value={l.price} onChange={(v) => setLine(i, { price: v })} required />
                <p className="small">
                  Tịnh <b>{formatKg(computed.net_kg)} kg</b> × {formatVnd(computed.price)} = <b>{formatVnd(computed.amount)}</b>
                  {lines.length > 1 && (
                    <>
                      {' '}
                      <button type="button" className="linklike danger" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                        Bỏ dòng này
                      </button>
                    </>
                  )}
                </p>
              </div>
            )
          })}
          <button type="button" onClick={() => setLines([...lines, { product_code: '', name: '', kg: '', deduct: '', price: 0 }])}>
            ＋ Thêm loại hàng
          </button>
        </fieldset>

        <div className="trade-total">
          <span>
            Tổng {formatKg(totals.kg)} kg tịnh
          </span>
          <b>{formatVnd(totals.amount)}</b>
        </div>
        <MoneyField label={kind === 'buy' ? 'Đã trả khách' : 'Khách đã trả'} value={paid} onChange={setPaid} />
        <div className="btn-row">
          <button type="button" onClick={() => setPaid(totals.amount)}>
            Trả đủ
          </button>
          <button type="button" onClick={() => setPaid(0)}>
            Chưa trả
          </button>
        </div>
        {paid < totals.amount && totals.amount > 0 && <p className="small out">{kind === 'buy' ? 'Còn nợ khách' : 'Khách còn nợ'} {formatVnd(totals.amount - paid)}</p>}
        <label>
          Ghi chú
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Ví dụ: độ ẩm 14%, hàng loại 1" />
        </label>
        {error && <div className="notice error">{error}</div>}
        <button type="submit" className="wide primary" disabled={sending || !shownName.trim() || totals.amount <= 0 || paid > totals.amount}>
          {sending ? 'Đang lưu…' : purchase ? 'Lưu phiếu' : 'Lập phiếu'}
        </button>
      </form>
    </div>
  )
}

function PurchaseView({ token, id }: { token: string; id: string }) {
  const [state, retry] = useAsync(() => api.purchase(token, id), [token, id])
  const [purchase, setPurchase] = useState<Purchase | null>(null)
  if (state.status !== 'ok') return <Status state={state} retry={retry} />
  const p = purchase ?? state.data

  const addPayment = async () => {
    const text = window.prompt(`Trả thêm bao nhiêu? (còn ${formatVnd(p.owing)})`, String(p.owing))
    const amount = Number((text ?? '').replace(/\D/g, ''))
    if (!amount) return
    try {
      setPurchase(await api.savePurchase(token, { date: p.date, lines: p.lines, paid: Math.min(p.amount, p.paid + amount) }, p.id))
      showToast({ message: 'Đã ghi tiền trả' })
    } catch (err) {
      showToast({ message: (err as Error).message })
    }
  }

  return (
    <div className="ledger">
      <a className="back" href={href('giao-dich')}>
        ‹ Sổ giao dịch
      </a>
      <h1>
        {p.kind === 'buy' ? '🛒 Phiếu mua' : '📦 Phiếu bán'} {p.code}
      </h1>
      <p className="muted">
        {formatDate(p.date)} · {p.kind === 'buy' ? 'mua của' : 'bán cho'}{' '}
        {p.customer ? <a href={href(`giao-dich/khach/${p.customer}`)}>{p.counterpart}</a> : <b>{p.counterpart}</b>}
        {p.phone && (
          <>
            {' '}
            · <a href={telHref(p.phone)}>{p.phone}</a>
          </>
        )}
      </p>
      <section className="card">
        <table className="trade-table">
          <thead>
            <tr>
              <th>Hàng</th>
              <th className="num">Cân</th>
              <th className="num">Trừ bì</th>
              <th className="num">Tịnh</th>
              <th className="num">Đơn giá</th>
              <th className="num">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {p.lines.map((l, i) => (
              <tr key={i}>
                <td>{l.name}</td>
                <td className="num">{formatKg(l.kg)}</td>
                <td className="num">{formatKg(l.deduct_kg)}</td>
                <td className="num">{formatKg(l.net_kg)}</td>
                <td className="num">{formatVnd(l.price)}</td>
                <td className="num">{formatVnd(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="deal-totals">
          <div>
            <dt>Tổng tiền hàng ({formatKg(p.kg)} kg tịnh)</dt>
            <dd>
              <b>{formatVnd(p.amount)}</b>
            </dd>
          </div>
          <div>
            <dt>Đã trả</dt>
            <dd>{formatVnd(p.paid)}</dd>
          </div>
          {p.owing > 0 && (
            <div>
              <dt>{p.kind === 'buy' ? 'Còn nợ khách' : 'Khách còn nợ'}</dt>
              <dd className="out">
                <b>{formatVnd(p.owing)}</b>
              </dd>
            </div>
          )}
        </dl>
        {p.note && <p className="small muted">Ghi chú: {p.note}</p>}
        {p.owing > 0 && (
          <button type="button" onClick={addPayment}>
            💵 Ghi tiền trả thêm
          </button>
        )}
      </section>
      <section className="card">
        <PrintButtons token={token} target={{ type: 'purchase', id: p.id }} label="In phiếu / gửi khách (có chỗ ký 2 bên, số tiền bằng chữ)" />
      </section>
      <ShareCard token={token} purchase={p} onChange={setPurchase} />
      {p.history && p.history.length > 1 && <HistoryCard history={p.history} sharedVersion={p.shared_version ?? null} />}
      <div className="btn-row">
        <a className="button" href={href(`giao-dich/phieu/${p.id}/sua`)}>
          Sửa phiếu
        </a>
        <button
          type="button"
          className="danger-outline"
          onClick={async () => {
            if (!window.confirm(`Xóa phiếu ${p.code}?`)) return
            await api.deletePurchase(token, p.id)
            showToast({ message: `Đã xóa phiếu ${p.code}` })
            go('giao-dich')
          }}
        >
          Xóa phiếu
        </button>
      </div>
    </div>
  )
}

/** Chia sẻ phiếu cho khách xem: mã 6 ký tự (gửi Zalo), hoặc gửi thẳng khi SĐT khách trùng tài khoản */
function ShareCard({ token, purchase: p, onChange }: { token: string; purchase: Purchase; onChange: (p: Purchase) => void }) {
  const [busy, setBusy] = useState(false)
  const act = async (action: () => Promise<Purchase>, message?: string) => {
    setBusy(true)
    try {
      onChange(await action())
      if (message) showToast({ message })
    } catch (err) {
      showToast({ message: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }
  const link = p.share_code ? `${window.location.origin}${window.location.pathname}#/don/tham-gia?ma=${p.share_code}` : ''
  const sendCode = async () => {
    const text = purchaseShareText(p, p.share_code!, link)
    try {
      if (navigator.share) await navigator.share({ title: `Phiếu ${p.code}`, text })
      else {
        await navigator.clipboard.writeText(text)
        showToast({ message: 'Đã chép lời nhắn kèm mã, dán vào Zalo để gửi khách.' })
      }
    } catch {
      // Người dùng hủy chia sẻ
    }
  }

  return (
    <section className="card">
      <h2>🔗 Chia sẻ phiếu với khách</h2>
      <p className="small muted">Khách có app Nhà Nông xem được phiếu và tải PDF / Word (không sửa được). Sửa phiếu sau khi gửi: khách thấy cả bản cũ và bản mới.</p>
      {p.account_match && (
        <div className="notice upgrade">
          <p>
            Số {p.account_match.phone} là tài khoản Nhà Nông của <b>{p.account_match.name}</b>.
          </p>
          <button type="button" className="primary" disabled={busy} onClick={() => act(async () => (await api.sendPurchase(token, p.id)).data, `Đã gửi phiếu vào app của ${p.account_match!.name}`)}>
            📲 Gửi vào app của khách
          </button>
        </div>
      )}
      {p.share_code ? (
        <>
          <p className="code">{p.share_code}</p>
          <div className="btn-row">
            <button type="button" className="primary" onClick={sendCode}>
              📤 Gửi mã cho khách (Zalo, tin nhắn…)
            </button>
            <button type="button" className="danger-outline" disabled={busy} onClick={() => window.confirm('Thu hồi mã? Người khác không nhập mã này được nữa; khách đã nhận vẫn giữ phiếu.') && act(() => api.unsharePurchase(token, p.id), 'Đã thu hồi mã')}>
              Thu hồi mã
            </button>
          </div>
        </>
      ) : (
        <button type="button" disabled={busy} onClick={() => act(() => api.sharePurchase(token, p.id))}>
          🔑 Tạo mã gửi khách
        </button>
      )}
      {(p.shared_with ?? []).length > 0 && (
        <p className="small">
          Đang xem phiếu: {(p.shared_with ?? []).map((v) => `${v.name}${v.via === 'phone' ? ' (gửi vào app)' : ' (nhập mã)'}`).join(', ')}
        </p>
      )}
    </section>
  )
}

/** Lịch sử phiếu: mỗi lần lưu là 1 bản (thời gian, đổi gì) */
function HistoryCard({ history, sharedVersion }: { history: PurchaseHistoryItem[]; sharedVersion: number | null }) {
  return (
    <section className="card">
      <h2>🕘 Lịch sử sửa phiếu</h2>
      <ol className="purchase-history">
        {history.map((h) => (
          <li key={h.version}>
            <b>{h.version === history[0].version ? (sharedVersion === h.version ? 'Bản gửi khách' : 'Bản đầu') : `Sửa lần ${h.version - history[0].version}`}</b>
            {h.version === sharedVersion && h.version !== history[0].version && <span className="tag">Bản gửi khách</span>}
            <span className="small muted"> · {h.at ? formatDateTime(h.at) : ''}</span>
            {h.changes.length > 0 ? (
              <ul>
                {h.changes.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            ) : (
              <p className="small muted">
                Tổng tiền {formatVnd(h.amount)}, đã trả {formatVnd(h.paid)}
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

/** Phiếu người khác gửi cho mình: chỉ xem, tải PDF / Word, thấy lịch sử sửa sau khi gửi */
function ReceivedView({ token, id }: { token: string; id: string }) {
  const [state, retry] = useAsync(() => api.receivedPurchase(token, id), [token, id])
  // Người lập vừa sửa / xóa phiếu (bộ theo dõi báo): tải lại ngay
  useEffect(() => dealWatcher.onDealChanged((changed) => changed === id && retry()), [id, retry])
  if (state.status !== 'ok') return <Status state={state} retry={retry} />
  const p = state.data
  return (
    <div className="ledger">
      <a className="back" href={href('don')}>
        ‹ Đơn mua bán
      </a>
      <h1>📄 Phiếu {p.code}</h1>
      <p className="muted">
        {formatDate(p.date)} · {p.issuer.name} lập · mình {p.kind === 'sell' ? 'bán cho' : 'mua của'} {p.issuer.name}
        {p.issuer.phone && (
          <>
            {' '}
            · <a href={telHref(p.issuer.phone)}>{p.issuer.phone}</a>
          </>
        )}
      </p>
      {p.deleted_at && <div className="notice error">Người lập phiếu đã xóa phiếu này lúc {formatDateTime(p.deleted_at)}. Phiếu vẫn được giữ ở đây để bạn đối chiếu.</div>}
      {!p.deleted_at && p.edited_after_share && <div className="notice upgrade">Phiếu đã được sửa sau khi gửi cho bạn. Xem các lần sửa ở dưới.</div>}
      <section className="card">
        <table className="trade-table">
          <thead>
            <tr>
              <th>Hàng</th>
              <th className="num">Cân</th>
              <th className="num">Trừ bì</th>
              <th className="num">Tịnh</th>
              <th className="num">Đơn giá</th>
              <th className="num">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            {p.lines.map((l, i) => (
              <tr key={i}>
                <td>{l.name}</td>
                <td className="num">{formatKg(l.kg)}</td>
                <td className="num">{formatKg(l.deduct_kg)}</td>
                <td className="num">{formatKg(l.net_kg)}</td>
                <td className="num">{formatVnd(l.price)}</td>
                <td className="num">{formatVnd(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="deal-totals">
          <div>
            <dt>Tổng tiền hàng ({formatKg(p.kg)} kg tịnh)</dt>
            <dd>
              <b>{formatVnd(p.amount)}</b>
            </dd>
          </div>
          <div>
            <dt>Đã trả</dt>
            <dd>{formatVnd(p.paid)}</dd>
          </div>
          {p.owing > 0 && (
            <div>
              <dt>{p.kind === 'sell' ? 'Bên mua còn nợ mình' : 'Mình còn nợ'}</dt>
              <dd className="out">
                <b>{formatVnd(p.owing)}</b>
              </dd>
            </div>
          )}
        </dl>
        {p.note && <p className="small muted">Ghi chú: {p.note}</p>}
      </section>
      <section className="card">
        <PrintButtons token={token} target={{ type: 'purchase', id: p.id }} label="Tải phiếu (có lịch sử sửa nếu phiếu đã sửa sau khi gửi)" />
      </section>
      {p.history.length > 1 && <HistoryCard history={p.history} sharedVersion={p.history[0].version} />}
    </div>
  )
}

function CustomerView({ token, id }: { token: string; id: string }) {
  const range = useRange()
  const [customers, retryCustomers] = useAsync(() => api.customers(token), [token])
  const [state, retry] = useAsync(() => api.transactions(token, { from: range.from, to: range.to, customer: id }), [token, id, range.from, range.to])
  const [editing, setEditing] = useState(false)
  if (customers.status !== 'ok') return <Status state={customers} retry={retryCustomers} />
  const c = customers.data.find((x) => x.id === id)
  if (!c) return <p className="muted">Không tìm thấy khách này.</p>

  return (
    <div className="ledger">
      <a className="back" href={href('giao-dich', { tab: 'khach' })}>
        ‹ Khách hàng
      </a>
      <h1>👤 {c.name}</h1>
      <p className="muted">
        {c.phone && (
          <>
            <a href={telHref(c.phone)}>{c.phone}</a> ·{' '}
          </>
        )}
        {c.address && `${c.address} · `}
        {c.count} phiếu
      </p>
      <div className="btn-row">
        <a className="button primary" href={href('giao-dich/moi', { loai: 'buy', khach: c.id })}>
          ＋ Phiếu mua
        </a>
        <a className="button" href={href('giao-dich/moi', { loai: 'sell', khach: c.id })}>
          ＋ Phiếu bán
        </a>
        <button type="button" onClick={() => setEditing(!editing)}>
          {editing ? 'Thôi' : 'Sửa thông tin'}
        </button>
      </div>
      {editing && (
        <CustomerForm
          token={token}
          customer={c}
          onSaved={() => {
            setEditing(false)
            retryCustomers()
          }}
        />
      )}
      {(c.i_owe > 0 || c.owes_me > 0) && (
        <div className="notice upgrade">
          {c.i_owe > 0 && <p>Mình còn nợ khách {formatVnd(c.i_owe)}</p>}
          {c.owes_me > 0 && <p>Khách còn nợ mình {formatVnd(c.owes_me)}</p>}
        </div>
      )}
      <section className="card form">
        <RangeFields range={range} />
      </section>
      <Status state={state} retry={retry} />
      {state.status === 'ok' && (
        <>
          <TotalsCard totals={state.data.meta.totals} />
          <div className="garden-list">
            {state.data.data.map((r) => (
              <TradeRowCard key={r.id} row={r} />
            ))}
          </div>
          <section className="card">
            <PrintButtons token={token} target={{ type: 'customer', id: c.id, from: range.from, to: range.to }} label="Bảng kê giao dịch của khách trong khoảng ngày này" />
          </section>
        </>
      )}
      <button
        type="button"
        className="danger-outline"
        onClick={async () => {
          if (!window.confirm(`Xóa khách ${c.name}? Các phiếu cũ vẫn giữ.`)) return
          await api.deleteCustomer(token, c.id)
          go('giao-dich', { tab: 'khach' })
        }}
      >
        Xóa khách
      </button>
    </div>
  )
}
