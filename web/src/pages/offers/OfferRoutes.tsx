import {
  ApiError,
  BID_STATUS_LABELS,
  describeLocation,
  formatDate,
  formatQuantity,
  formatVnd,
  kgInputText,
  OFFER_STATUS_LABELS,
  offerValue,
  parseKgText,
  RADIUS_OPTIONS,
  telHref,
  today,
  type Category,
  type ProduceOffer,
} from '@nhanong/shared'
import { useState, type FormEvent } from 'react'
import { api } from '../../api'
import { useAuth } from '../../auth'
import { DateField } from '../../components/DateField'
import { LocationBar } from '../../components/LocationPicker'
import { Status } from '../../components/Status'
import { go, href, replaceQuery, useAsync } from '../../hooks'
import { showToast } from '../../ledger/toast'
import { useMyLocation } from '../../myLocation'
import { MoneyField, QtyField } from '../ledger/fields'

type Tab = 'cua-toi' | 'cho' | 'da-tra-gia'

const errorText = (err: unknown) => (err instanceof ApiError ? (Object.values(err.errors)[0]?.[0] ?? err.message) : (err as Error).message)

/**
 * #/chao-ban/...: chào bán lô hàng (tải riêng).
 * #/chao-ban?tab=cua-toi|cho|da-tra-gia, #/chao-ban/moi, #/chao-ban/:uuid, #/chao-ban/:uuid/sua
 * Nông dân đăng lô sắp thu hoạch; điểm mua / lái quanh đó trả giá; nông dân chọn 1 giá rồi 2 bên gọi nhau.
 */
export default function OfferRoutes({ path, query }: { path: string[]; query: URLSearchParams }) {
  const auth = useAuth()
  const [, page, action] = path

  if (!auth)
    return (
      <div className="ledger">
        <h1>📣 Chào bán lô hàng</h1>
        <div className="notice upgrade">
          <p>Nông dân đăng lô hàng sắp thu hoạch, các điểm mua quanh vườn trả giá, bạn chọn giá cao nhất. Cần đăng nhập.</p>
          <a className="button primary" href={href('tai-khoan', { ve: path.join('/') })}>
            Đăng nhập / Đăng ký
          </a>
        </div>
      </div>
    )

  if (page === 'moi') return <OfferForm token={auth.token} />
  if (page && action === 'sua') return <OfferEdit token={auth.token} id={page} />
  if (page) return <OfferDetail key={page} token={auth.token} id={page} />
  const tab = (['cua-toi', 'cho', 'da-tra-gia'].includes(query.get('tab') ?? '') ? query.get('tab') : 'cua-toi') as Tab
  return (
    <div className="ledger">
      <h1>📣 Chào bán lô hàng</h1>
      <p className="small muted">Nông dân đăng lô sắp thu hoạch, các điểm mua / lái quanh vườn trả giá, nông dân chọn 1 giá. Chọn xong 2 bên mới thấy số điện thoại của nhau.</p>
      <div className="btn-row">
        <a className="button primary" href={href('chao-ban/moi')}>
          ＋ Chào bán lô hàng
        </a>
      </div>
      <nav className="segmented" aria-label="Mục">
        {(
          [
            ['cua-toi', 'Lô của tôi'],
            ['cho', 'Chợ lô hàng'],
            ['da-tra-gia', 'Tôi đã trả giá'],
          ] as const
        ).map(([key, label]) => (
          <button key={key} type="button" className={tab === key ? 'active' : ''} aria-pressed={tab === key} onClick={() => replaceQuery('chao-ban', { tab: key })}>
            {label}
          </button>
        ))}
      </nav>
      {tab === 'cua-toi' && <MyOffers token={auth.token} />}
      {tab === 'cho' && <Market token={auth.token} />}
      {tab === 'da-tra-gia' && <MyBids token={auth.token} />}
    </div>
  )
}

function OfferCard({ offer: o }: { offer: ProduceOffer }) {
  return (
    <a className="card garden-row" href={href(`chao-ban/${o.id}`)}>
      <span className="garden-name">
        🌾 {o.product_name} · {formatQuantity(o.quantity_kg)}
        <span className="small muted">
          {' '}
          · thu hoạch {formatDate(o.harvest_date, true)}
          {o.place_label ? ` · ${o.place_label}` : o.province_name ? ` · ${o.province_name}` : ''}
          {o.distance_km != null ? ` · cách ${o.distance_km} km` : ''}
        </span>
        <br />
        <span className="small">
          {o.bids_count > 0 ? `${o.bids_count} giá · cao nhất ${formatVnd(o.best_price ?? 0)}/kg` : 'Chưa có ai trả giá'}
          {o.expected_price ? ` · mong muốn ${formatVnd(o.expected_price)}/kg` : ''}
        </span>
        {o.status !== 'open' && <span className="tag">{OFFER_STATUS_LABELS[o.status]}</span>}
        {o.my_bid && <span className={`tag${o.my_bid.status === 'accepted' ? '' : ' overdue'}`}>Giá của tôi {formatVnd(o.my_bid.price)}: {BID_STATUS_LABELS[o.my_bid.status]}</span>}
      </span>
    </a>
  )
}

function MyOffers({ token }: { token: string }) {
  const [state, retry] = useAsync(() => api.myOffers(token), [token])
  return (
    <>
      <Status state={state} retry={retry} />
      {state.status === 'ok' && state.data.length === 0 && <p className="muted">Bạn chưa chào bán lô nào. Bấm "＋ Chào bán lô hàng" khi sắp thu hoạch để các điểm mua trả giá.</p>}
      <div className="garden-list">{state.status === 'ok' && state.data.map((o) => <OfferCard key={o.id} offer={o} />)}</div>
    </>
  )
}

function MyBids({ token }: { token: string }) {
  const [state, retry] = useAsync(() => api.myOfferBids(token), [token])
  return (
    <>
      <Status state={state} retry={retry} />
      {state.status === 'ok' && state.data.length === 0 && <p className="muted">Bạn chưa trả giá lô nào.</p>}
      <div className="garden-list">{state.status === 'ok' && state.data.map((o) => <OfferCard key={o.id} offer={o} />)}</div>
    </>
  )
}

/** Điểm mua / lái: các lô đang nhận giá quanh "Khu vực của tôi" */
function Market({ token }: { token: string }) {
  const location = useMyLocation()
  const [radius, setRadius] = useState(location?.radius ?? 30)
  const [state, retry] = useAsync(
    () => (location ? api.offerMarket(token, { lat: location.lat, lng: location.lng, radius }) : Promise.resolve(null)),
    [token, location?.lat, location?.lng, radius],
  )
  return (
    <>
      <LocationBar title="Tìm lô hàng quanh" />
      {location && (
        <div className="segmented">
          {RADIUS_OPTIONS.map((r) => (
            <button key={r} type="button" className={r === radius ? 'active' : ''} aria-pressed={r === radius} onClick={() => setRadius(r)}>
              {r} km
            </button>
          ))}
        </div>
      )}
      <Status state={state} retry={retry} />
      {state.status === 'ok' && state.data && (
        <>
          {!state.data.meta.can_bid && (
            <div className="notice upgrade">
              Muốn trả giá: đăng ký <a href={href('diem-mua')}>hồ sơ điểm mua</a> (chờ duyệt), hoặc vào doanh nghiệp thu mua bằng mã mời của chủ.
            </div>
          )}
          {state.data.data.length === 0 && <p className="muted">Chưa có lô nào đang chào bán trong {radius} km.</p>}
          <div className="garden-list">
            {state.data.data.map((o) => (
              <OfferCard key={o.id} offer={o} />
            ))}
          </div>
        </>
      )}
    </>
  )
}

function OfferEdit({ token, id }: { token: string; id: string }) {
  const [state, retry] = useAsync(() => api.offer(token, id), [token, id])
  if (state.status !== 'ok') return <Status state={state} retry={retry} />
  return <OfferForm token={token} offer={state.data} />
}

/** Đăng / sửa lô hàng: mặt hàng, số kg, ngày thu hoạch, giá mong muốn, vị trí vườn (Khu vực của tôi) */
function OfferForm({ token, offer }: { token: string; offer?: ProduceOffer }) {
  const location = useMyLocation()
  const [categories] = useAsync(() => api.categories(), [])
  const [productCode, setProductCode] = useState(offer?.product?.code ?? '')
  const [name, setName] = useState(offer?.product_name ?? '')
  const [kg, setKg] = useState(offer ? kgInputText(offer.quantity_kg) : '')
  const [expected, setExpected] = useState(offer?.expected_price ?? 0)
  const [harvest, setHarvest] = useState(offer?.harvest_date ?? today())
  const [note, setNote] = useState(offer?.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const products = categories.status === 'ok' ? categories.data.filter((c: Category) => c.type === 'nong_san').flatMap((c) => c.products.map((p) => ({ ...p, group: c.name }))) : []
  // Sửa lô: giữ vị trí cũ; lô mới: lấy Khu vực của tôi
  const place = offer ? { lat: offer.lat, lng: offer.lng, province: offer.province, label: offer.place_label } : location ? { lat: location.lat, lng: location.lng, province: location.province, label: describeLocation(location) } : null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!place) return setError('Hãy chọn vị trí vườn ở trên.')
    setSending(true)
    setError(null)
    try {
      const saved = await api.saveOffer(
        token,
        {
          product_code: productCode || null,
          product_name: name.trim(),
          quantity_kg: parseKgText(kg),
          expected_price: expected || null,
          harvest_date: harvest,
          province_code: place.province,
          lat: place.lat,
          lng: place.lng,
          place_label: place.label,
          note: note.trim() || null,
        },
        offer?.id,
      )
      showToast({ message: offer ? 'Đã lưu lô hàng' : 'Đã chào bán. Các điểm mua quanh vườn sẽ nhận thông báo.' })
      go(`chao-ban/${saved.id}`)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="ledger">
      <a className="back" href={offer ? href(`chao-ban/${offer.id}`) : href('chao-ban')}>
        ‹ {offer ? 'Lô hàng' : 'Chào bán'}
      </a>
      <h1>{offer ? 'Sửa lô hàng' : '📣 Chào bán lô hàng'}</h1>
      {!offer && <LocationBar title="Vị trí vườn (để điểm mua gần đó thấy)" />}
      {!offer && location && !location.gps && <p className="small out">Đang dùng trung tâm tỉnh. Bấm "Đổi" và tìm xã / phường để điểm mua gần vườn thấy lô của bạn.</p>}
      <form className="card form" onSubmit={submit}>
        <label>
          Mặt hàng
          <select
            value={productCode}
            onChange={(e) => {
              const p = products.find((x) => x.code === e.target.value)
              setProductCode(e.target.value)
              if (p) setName(p.name)
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
          Tên hàng *
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} placeholder="Ví dụ: Sầu riêng Ri6 loại 1" />
        </label>
        <QtyField label="Số lượng ước tính (kg) *" text={kg} onText={setKg} suffix="kg" />
        <DateField label="Ngày thu hoạch dự kiến" value={harvest} onChange={setHarvest} min={today()} />
        <MoneyField label="Giá mong muốn (đ/kg, không bắt buộc)" value={expected} onChange={setExpected} />
        <label>
          Ghi chú
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Ví dụ: hàng loại 1, bán cả vườn, xe tải vào được" />
        </label>
        {error && <div className="notice error">{error}</div>}
        <button type="submit" className="wide primary" disabled={sending || !name.trim() || parseKgText(kg) <= 0 || !place}>
          {sending ? 'Đang lưu…' : offer ? 'Lưu' : 'Chào bán'}
        </button>
      </form>
    </div>
  )
}

function OfferDetail({ token, id }: { token: string; id: string }) {
  const [state, retry] = useAsync(() => api.offer(token, id), [token, id])
  const [offer, setOffer] = useState<ProduceOffer | null>(null)
  if (state.status !== 'ok') return <Status state={state} retry={retry} />
  const o = offer ?? state.data

  const act = async (action: () => Promise<ProduceOffer>, message: string) => {
    try {
      setOffer(await action())
      showToast({ message })
    } catch (err) {
      showToast({ message: errorText(err) })
    }
  }

  return (
    <div className="ledger">
      <a className="back" href={href('chao-ban', { tab: o.is_mine ? 'cua-toi' : o.my_bid ? 'da-tra-gia' : 'cho' })}>
        ‹ Chào bán
      </a>
      <h1>
        🌾 {o.product_name} · {formatQuantity(o.quantity_kg)}
      </h1>
      <p className="muted">
        Thu hoạch {formatDate(o.harvest_date)} · {o.place_label ?? o.province_name ?? ''}
        {o.distance_km != null ? ` · cách ${o.distance_km} km` : ''} · <b>{OFFER_STATUS_LABELS[o.status]}</b>
      </p>
      <section className="card">
        <dl className="deal-totals">
          <div>
            <dt>Nông dân</dt>
            <dd>
              {o.farmer.name}
              {o.farmer.phone && (
                <>
                  {' '}
                  · <a href={telHref(o.farmer.phone)}>📞 {o.farmer.phone}</a>
                </>
              )}
            </dd>
          </div>
          {o.expected_price && (
            <div>
              <dt>Giá mong muốn</dt>
              <dd>{formatVnd(o.expected_price)}/kg</dd>
            </div>
          )}
          <div>
            <dt>Số người trả giá</dt>
            <dd>
              {o.bids_count}
              {o.best_price ? ` · cao nhất ${formatVnd(o.best_price)}/kg` : ''}
            </dd>
          </div>
        </dl>
        {o.note && <p className="small muted">Ghi chú: {o.note}</p>}
      </section>
      {o.is_mine ? <OwnerBids token={token} offer={o} act={act} /> : <BidBox token={token} offer={o} act={act} />}
    </div>
  )
}

/** Nông dân: các giá được trả (cao trước), chọn 1 giá; sửa / đóng / mở lại / gỡ lô */
function OwnerBids({ token, offer: o, act }: { token: string; offer: ProduceOffer; act: (action: () => Promise<ProduceOffer>, message: string) => Promise<void> }) {
  const bids = o.bids ?? []
  return (
    <>
      <h2 className="section">Giá các điểm mua trả</h2>
      {bids.length === 0 && <p className="muted">Chưa có ai trả giá. Các điểm mua trong 30 km đã nhận thông báo; khi có giá bạn sẽ được báo.</p>}
      {bids.map((b) => (
        <section key={b.id} className="card">
          <p>
            <b>{formatVnd(b.price)}/kg</b>
            <span className="small muted"> · cả lô ≈ {formatVnd(offerValue(o, b.price))}</span>
            {b.status !== 'pending' && <span className={`tag${b.status === 'accepted' ? '' : ' overdue'}`}>{BID_STATUS_LABELS[b.status]}</span>}
          </p>
          <p className="small">
            {b.buyer?.name}
            {b.buyer?.verified ? ' ✓' : ''}
            {b.quantity_kg ? ` · lấy ${formatQuantity(b.quantity_kg)}` : ''}
            {b.note ? ` · ${b.note}` : ''}
          </p>
          <div className="btn-row">
            {b.buyer?.phone && (
              <a className="button" href={telHref(b.buyer.phone)}>
                📞 Gọi {b.buyer.phone}
              </a>
            )}
            {o.status === 'open' && b.status === 'pending' && (
              <button
                type="button"
                className="primary"
                onClick={() => window.confirm(`Chọn giá ${formatVnd(b.price)}/kg của ${b.buyer?.name}? Các giá khác sẽ bị từ chối.`) && act(() => api.acceptBid(token, o.id, b.id), 'Đã chọn giá. Hãy gọi người mua để hẹn ngày cân.')}
              >
                ✅ Chọn giá này
              </button>
            )}
          </div>
        </section>
      ))}
      <div className="btn-row">
        {o.status === 'open' && (
          <>
            <a className="button" href={href(`chao-ban/${o.id}/sua`)}>
              Sửa lô
            </a>
            <button type="button" onClick={() => act(() => api.setOfferStatus(token, o.id, 'closed'), 'Đã đóng, điểm mua không trả giá được nữa')}>
              Đóng (ngừng nhận giá)
            </button>
          </>
        )}
        {o.status === 'closed' && (
          <button type="button" onClick={() => act(() => api.setOfferStatus(token, o.id, 'open'), 'Đã mở lại')}>
            Mở lại
          </button>
        )}
        <button
          type="button"
          className="danger-outline"
          onClick={async () => {
            if (!window.confirm('Gỡ hẳn lô hàng này?')) return
            await api.deleteOffer(token, o.id)
            showToast({ message: 'Đã gỡ lô hàng' })
            go('chao-ban')
          }}
        >
          Gỡ lô
        </button>
      </div>
    </>
  )
}

/** Điểm mua / lái: trả giá (sửa được tới khi nông dân chọn), rút giá */
function BidBox({ token, offer: o, act }: { token: string; offer: ProduceOffer; act: (action: () => Promise<ProduceOffer>, message: string) => Promise<void> }) {
  const mine = o.my_bid
  const [price, setPrice] = useState(mine?.price ?? 0)
  const [kg, setKg] = useState(mine?.quantity_kg ? kgInputText(mine.quantity_kg) : '')
  const [note, setNote] = useState(mine?.note ?? '')

  if (mine?.status === 'accepted')
    return <div className="notice upgrade">✅ Nông dân đã chọn giá {formatVnd(mine.price)}/kg của bạn. Gọi {o.farmer.phone ? <a href={telHref(o.farmer.phone)}>{o.farmer.phone}</a> : 'nông dân'} để hẹn ngày cân.</div>
  if (o.status !== 'open') return <p className="muted">{mine ? `Giá của bạn: ${formatVnd(mine.price)}/kg · ${BID_STATUS_LABELS[mine.status]}` : 'Lô này đã ngừng nhận giá.'}</p>

  return (
    <form
      className="card form"
      onSubmit={(e) => {
        e.preventDefault()
        void act(() => api.bidOffer(token, o.id, { price, quantity_kg: parseKgText(kg) || null, note: note.trim() || null }), mine ? 'Đã sửa giá' : 'Đã gửi giá cho nông dân')
      }}
    >
      <h2>{mine && mine.status === 'pending' ? `Giá của bạn: ${formatVnd(mine.price)}/kg` : 'Trả giá'}</h2>
      <p className="small muted">Nông dân chỉ thấy giá và tên của bạn. Khi nông dân chọn giá của bạn, 2 bên thấy số điện thoại của nhau.</p>
      <MoneyField label="Giá trả (đ/kg) *" value={price} onChange={setPrice} required />
      {price > 0 && <p className="small">Cả lô ≈ {formatVnd(offerValue(o, price))}</p>}
      <QtyField label="Lấy bao nhiêu (để trống: cả lô)" text={kg} onText={setKg} suffix="kg" />
      <label>
        Ghi chú cho nông dân
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Ví dụ: cân tại vườn, trả tiền mặt ngay" />
      </label>
      <button type="submit" className="wide primary" disabled={price <= 0}>
        {mine && mine.status === 'pending' ? 'Sửa giá' : 'Gửi giá'}
      </button>
      {mine && mine.status === 'pending' && (
        <button type="button" className="danger-outline" onClick={() => act(() => api.withdrawBid(token, o.id), 'Đã rút giá')}>
          Rút giá
        </button>
      )}
    </form>
  )
}
