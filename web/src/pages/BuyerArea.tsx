import {
  ApiError,
  BUYER_KIND_LABELS,
  BUYER_STATUS_LABELS,
  addDays,
  formatDate,
  formatVnd,
  nearestProvince,
  SHOP_TYPE_LABELS,
  today,
  type BuyerKind,
  type BuyerProfile,
  type BuyerReport,
  type Category,
  type ShopType,
} from '@nhanong/shared'
import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import { DateField } from '../components/DateField'
import { Status } from '../components/Status'
import { href, useAsync } from '../hooks'
import { useMyLocation } from '../myLocation'
import { MoneyField } from './ledger/fields'

const KINDS = Object.keys(BUYER_KIND_LABELS) as BuyerKind[]
const DEALS = Object.keys(SHOP_TYPE_LABELS) as ShopType[]
/** Nhóm mặt hàng được đăng giá theo "mua / bán gì" trong hồ sơ */
const CATEGORY_OF: Record<ShopType, Category['type']> = { thu_mua: 'nong_san', phan_bon: 'phan_bon', thuoc_bvtv: 'thuoc_bvtv' }

/** #/diem-mua: đăng ký điểm mua (admin duyệt) rồi đăng giá hằng ngày */
export function BuyerArea() {
  const auth = useAuth()
  const [version, setVersion] = useState(0)
  const [editing, setEditing] = useState(false)
  const [state, retry] = useAsync(() => (auth ? api.myBuyer(auth.token) : Promise.resolve(null)), [auth?.token, version])
  const reload = () => setVersion((v) => v + 1)

  if (!auth)
    return (
      <div className="ledger">
        <h1>🏪 Điểm mua đăng giá</h1>
        <div className="notice">
          Doanh nghiệp, đại lý, thương lái, điểm bán lẻ đăng giá mua / bán của mình để bà con quanh vùng biết. Cần đăng nhập bằng số điện thoại.
          <p>
            <a className="button primary" href={href('tai-khoan', { ve: 'diem-mua' })}>
              Đăng nhập / đăng ký
            </a>
          </p>
        </div>
      </div>
    )

  if (state.status !== 'ok') return <Status state={state} retry={retry} />
  const buyer = state.data

  return (
    <div className="ledger">
      <a className="back" href={href('gia-quanh-toi')}>
        ‹ Giá quanh tôi
      </a>
      <h1>🏪 Điểm mua đăng giá</h1>
      {!buyer || editing ? (
        <BuyerForm token={auth.token} buyer={buyer} onSaved={() => (setEditing(false), reload())} onCancel={buyer ? () => setEditing(false) : undefined} />
      ) : (
        <>
          <section className={`card buyer-status ${buyer.status}`}>
            <p>
              <b>{buyer.name}</b>
              {buyer.is_verified && <span className="badge">✓ Đã xác minh</span>}
            </p>
            <p className="small muted">
              {buyer.kind_label} · {buyer.deals_in.map((d) => SHOP_TYPE_LABELS[d]).join(', ')} · {buyer.province_name}
            </p>
            <p>{BUYER_STATUS_LABELS[buyer.status]}</p>
            {buyer.status === 'pending' && <p className="small muted">Hồ sơ đang chờ kiểm tra. Khi được duyệt bạn sẽ đăng giá được và điểm của bạn hiện trong danh sách Điểm bán.</p>}
            {(buyer.status === 'rejected' || buyer.status === 'suspended') && buyer.admin_note && <p className="out">Lý do: {buyer.admin_note}</p>}
            <button type="button" onClick={() => setEditing(true)}>
              {buyer.status === 'rejected' ? 'Sửa và gửi lại' : 'Sửa hồ sơ'}
            </button>
          </section>
          {buyer.status === 'approved' && <PostPrices token={auth.token} buyer={buyer} />}
        </>
      )}
    </div>
  )
}

function BuyerForm({ token, buyer, onSaved, onCancel }: { token: string; buyer: BuyerProfile | null; onSaved: () => void; onCancel?: () => void }) {
  const myLocation = useMyLocation()
  const [provinces] = useAsync(() => api.provinces(), [])
  const [form, setForm] = useState({
    name: buyer?.name ?? '',
    kind: buyer?.kind ?? ('dai_ly' as BuyerKind),
    deals_in: buyer?.deals_in ?? (['thu_mua'] as ShopType[]),
    phone: buyer?.phone ?? '',
    address: buyer?.address ?? '',
    province_code: buyer?.province ?? myLocation?.province ?? '',
    goods: buyer?.goods ?? '',
  })
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(buyer ? { lat: buyer.lat, lng: buyer.lng } : null)
  const [message, setMessage] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm({ ...form, [key]: value })

  const locate = () => {
    if (!navigator.geolocation) return setMessage('Trình duyệt không hỗ trợ lấy vị trí.')
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const next = { lat: Math.round(p.coords.latitude * 1e5) / 1e5, lng: Math.round(p.coords.longitude * 1e5) / 1e5 }
        setPoint(next)
        if (!form.province_code) set('province_code', nearestProvince(next.lat, next.lng))
        setMessage(null)
      },
      () => setMessage(window.isSecureContext ? 'Không lấy được vị trí.' : 'Trình duyệt chỉ cho lấy vị trí khi mở bằng https. Hãy dùng "Khu vực của tôi" hoặc mở trên điện thoại bằng app.'),
      { timeout: 15000 },
    )
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!point) return setMessage('Hãy chọn vị trí điểm mua.')
    setSaving(true)
    setErrors({})
    try {
      const result = await api.saveBuyer(token, { ...form, ...point })
      setMessage(result.message ?? 'Đã lưu hồ sơ.')
      onSaved()
    } catch (error) {
      if (error instanceof ApiError) setErrors(error.errors)
      setMessage((error as Error).message)
    } finally {
      setSaving(false)
    }
  }
  const err = (key: string) => errors[key] && <span className="field-error">{errors[key][0]}</span>

  return (
    <form className="form card" onSubmit={submit}>
      <p className="small muted">Hồ sơ được kiểm tra trước khi đăng giá, để bà con tin giá trên app là giá thật.</p>
      <label>
        Tên điểm mua / doanh nghiệp *
        <input value={form.name} onChange={(e) => set('name', e.target.value)} required maxLength={120} placeholder="Ví dụ: Đại lý cà phê Hai Lúa" />
        {err('name')}
      </label>
      <fieldset>
        <legend>Bạn là</legend>
        <div className="segmented wrap">
          {KINDS.map((k) => (
            <button key={k} type="button" className={k === form.kind ? 'active' : ''} aria-pressed={k === form.kind} onClick={() => set('kind', k)}>
              {BUYER_KIND_LABELS[k]}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Mua / bán gì (chọn được nhiều)</legend>
        <div className="segmented wrap">
          {DEALS.map((d) => {
            const on = form.deals_in.includes(d)
            return (
              <button key={d} type="button" className={on ? 'active' : ''} aria-pressed={on} onClick={() => set('deals_in', on ? form.deals_in.filter((x) => x !== d) : [...form.deals_in, d])}>
                {SHOP_TYPE_LABELS[d]}
              </button>
            )
          })}
        </div>
        {err('deals_in')}
      </fieldset>
      <label>
        Số điện thoại liên hệ *
        <input type="tel" inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} required maxLength={20} />
        {err('phone')}
      </label>
      <label>
        Địa chỉ
        <input value={form.address} onChange={(e) => set('address', e.target.value)} maxLength={255} placeholder="Số nhà, đường, xã" />
      </label>
      <label>
        Tỉnh / thành *
        <select value={form.province_code} onChange={(e) => set('province_code', e.target.value)} required>
          <option value="">Chọn tỉnh / thành</option>
          {provinces.status === 'ok' &&
            provinces.data.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
        </select>
      </label>
      <fieldset>
        <legend>Vị trí điểm mua *</legend>
        <div className="actions">
          <button type="button" onClick={locate}>
            📍 Dùng vị trí hiện tại
          </button>
          {myLocation?.gps && (
            <button type="button" onClick={() => (setPoint({ lat: myLocation.lat, lng: myLocation.lng }), set('province_code', myLocation.province))}>
              Dùng “Khu vực của tôi”
            </button>
          )}
        </div>
        <span className="small muted">{point ? `Đã chọn: ${point.lat}, ${point.lng}` : 'Chưa chọn vị trí (bà con tìm giá theo khoảng cách tới điểm của bạn).'}</span>
        {err('lat')}
      </fieldset>
      <label>
        Mặt hàng (ghi thêm)
        <input value={form.goods} onChange={(e) => set('goods', e.target.value)} maxLength={255} placeholder="Ví dụ: thu mua cà phê, tiêu; bán phân NPK" />
      </label>
      {message && <div className="notice">{message}</div>}
      <div className="actions">
        <button type="submit" className="primary" disabled={saving || !form.name.trim() || form.deals_in.length === 0 || !form.province_code}>
          {saving ? 'Đang gửi…' : buyer ? 'Lưu hồ sơ' : 'Gửi hồ sơ'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Thôi
          </button>
        )}
      </div>
    </form>
  )
}

/** Đăng giá: chọn mặt hàng + giá + ngày; giá đã đăng gần đây có thể đăng lại cho hôm nay 1 chạm */
function PostPrices({ token, buyer }: { token: string; buyer: BuyerProfile }) {
  const [version, setVersion] = useState(0)
  const [categories] = useAsync(() => api.categories(), [])
  const [reports, retryReports] = useAsync(() => api.myBuyerPrices(token), [token, version])
  const [product, setProduct] = useState('')
  const [price, setPrice] = useState(0)
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const allowedTypes = buyer.deals_in.map((d) => CATEGORY_OF[d])
  const products = categories.status === 'ok' ? categories.data.filter((c) => allowedTypes.includes(c.type)).flatMap((c) => c.products.map((p) => ({ ...p, group: c.name }))) : []
  const unit = products.find((p) => p.code === product)?.unit

  const post = async (input: { product: string; price: number; date?: string; note?: string | null }) => {
    setSending(true)
    try {
      const result = await api.postBuyerPrice(token, input)
      setMessage(result.message)
      setVersion((v) => v + 1)
      return true
    } catch (error) {
      setMessage((error as Error).message)
      return false
    } finally {
      setSending(false)
    }
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (await post({ product, price, date, note: note.trim() || null })) {
      setPrice(0)
      setNote('')
    }
  }
  const remove = async (r: BuyerReport) => {
    if (!window.confirm(`Xóa giá ${r.product.name} ngày ${formatDate(r.date)}?`)) return
    await api.deleteBuyerPrice(token, r.id)
    setVersion((v) => v + 1)
  }

  // Giá mới nhất của từng mặt hàng (danh sách đã xếp mới trước); mặt hàng đã đăng hôm nay thì không cần đăng lại
  const latestByProduct = new Map<string, BuyerReport>()
  if (reports.status === 'ok') for (const r of reports.data) if (!latestByProduct.has(r.product.code)) latestByProduct.set(r.product.code, r)
  const latest = [...latestByProduct.values()].filter((r) => r.date !== today())

  return (
    <>
      <form className="form card" onSubmit={submit}>
        <h2>Đăng giá</h2>
        <label>
          Mặt hàng *
          <select value={product} onChange={(e) => setProduct(e.target.value)} required>
            <option value="">Chọn mặt hàng</option>
            {products.map((p) => (
              <option key={p.code} value={p.code}>
                {p.group} · {p.name} ({p.unit})
              </option>
            ))}
          </select>
        </label>
        <MoneyField label={`Giá ${buyer.deals_in.includes('thu_mua') && allowedTypes.length === 1 ? 'thu mua' : 'mua / bán'}${unit ? ` (đ/${unit})` : ''} *`} value={price} onChange={setPrice} required />
        <DateField label="Ngày" value={date} onChange={setDate} max={today()} min={addDays(today(), -7)} />
        <label>
          Ghi chú
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Ví dụ: hàng loại 1, độ ẩm dưới 15%" />
        </label>
        {message && <div className="notice">{message}</div>}
        <button type="submit" className="wide primary" disabled={!product || !(price > 0) || sending}>
          {sending ? 'Đang đăng…' : 'Đăng giá'}
        </button>
      </form>

      {latest.length > 0 && (
        <section className="card">
          <h2>Đăng lại cho hôm nay</h2>
          <p className="small muted">Giá không đổi so với lần trước thì bấm “Giữ giá” là xong.</p>
          {latest.map((r) => (
            <div key={r.product.code} className="field-def">
              <span>
                <b>{r.product.name}</b> <span className="small muted">· lần trước {formatDate(r.date, true)}</span>
              </span>
              <button type="button" disabled={sending} onClick={() => post({ product: r.product.code, price: r.price })}>
                Giữ giá {formatVnd(r.price)}
              </button>
            </div>
          ))}
        </section>
      )}

      <h2 className="section">Giá đã đăng (30 ngày)</h2>
      <Status state={reports} retry={retryReports} />
      {reports.status === 'ok' && reports.data.length === 0 && <p className="muted">Chưa đăng giá nào.</p>}
      <div className="entries">
        {reports.status === 'ok' &&
          reports.data.map((r) => (
            <div key={r.id} className="entry">
              <span className="entry-main">
                <span className="entry-text">
                  <span>
                    {r.product.name} · {formatDate(r.date, true)}
                  </span>
                  <span className={`small ${r.status === 'published' ? 'muted' : 'out'}`}>
                    {r.status_label}
                    {r.review_reason ? ` · ${r.review_reason}` : ''}
                    {r.note ? ` · ${r.note}` : ''}
                  </span>
                </span>
                <span className="amount">
                  {formatVnd(r.price)}/{r.unit}
                </span>
              </span>
              <button type="button" className="entry-del" aria-label="Xóa giá này" onClick={() => remove(r)}>
                🗑
              </button>
            </div>
          ))}
      </div>
    </>
  )
}
