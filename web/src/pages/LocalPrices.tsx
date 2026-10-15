import {
  CATEGORY_TYPE_LABELS,
  compareToReference,
  formatDate,
  formatDistance,
  formatVnd,
  SHOP_TYPE_LABELS,
  telHref,
  type CategoryType,
  type LocalPriceProduct,
} from '@nhanong/shared'
import { useState } from 'react'
import { api } from '../api'
import { LocationBar } from '../components/LocationPicker'
import { Status } from '../components/Status'
import { href, replaceQuery, useAsync } from '../hooks'
import { useMyLocation } from '../myLocation'

const TYPES = Object.keys(CATEGORY_TYPE_LABELS) as CategoryType[]

/** #/gia-quanh-toi: giá các điểm mua quanh khu vực của tôi + dịch vụ gần đó */
export function LocalPrices({ query }: { query: URLSearchParams }) {
  const location = useMyLocation()
  const type = (TYPES.find((t) => t === query.get('type')) ?? 'nong_san') as CategoryType

  return (
    <div className="ledger">
      <h1>📍 Giá quanh tôi</h1>
      <p className="small muted">Giá do các điểm mua đã được duyệt đăng trong 7 ngày gần đây, so với giá chung trên báo.</p>
      <LocationBar />
      {location && (
        <>
          <nav className="tabs" aria-label="Nhóm hàng">
            {TYPES.map((t) => (
              <button key={t} type="button" className={t === type ? 'active' : ''} aria-pressed={t === type} onClick={() => replaceQuery('gia-quanh-toi', { type: t })}>
                {CATEGORY_TYPE_LABELS[t]}
              </button>
            ))}
          </nav>
          <LocalPriceList type={type} />
          <NearbyServices />
          <p className="center small">
            Bạn là doanh nghiệp, đại lý, thương lái? <a href={href('diem-mua')}>Đăng ký để đăng giá ›</a>
          </p>
        </>
      )}
    </div>
  )
}

function LocalPriceList({ type, product }: { type?: CategoryType; product?: string }) {
  const location = useMyLocation()!
  const [state, retry] = useAsync(
    () => api.localPrices({ lat: location.lat, lng: location.lng, province: location.province, radius: location.radius, type, product }),
    [location.lat, location.lng, location.radius, location.province, type, product],
  )
  if (state.status !== 'ok') return <Status state={state} retry={retry} />
  if (state.data.data.length === 0)
    return (
      <div className="notice">
        Chưa có điểm mua nào trong {location.radius} km đăng giá {type ? CATEGORY_TYPE_LABELS[type].toLowerCase() : 'mặt hàng này'} gần đây. Thử tăng bán kính, hoặc xem{' '}
        <a href={href('')}>giá chung trên báo</a>.
      </div>
    )
  return (
    <>
      {state.data.data.map((p) => (
        <LocalPriceCard key={p.product.code} item={p} />
      ))}
    </>
  )
}

/** Giá quanh tôi cho 1 mặt hàng (đặt trong trang biểu đồ của mặt hàng) */
export function LocalPriceForProduct({ code }: { code: string }) {
  const location = useMyLocation()
  return (
    <section className="local-for-product">
      <h2 className="section">📍 Giá các điểm mua quanh bạn</h2>
      {location ? <LocalPriceList product={code} /> : <LocationBar />}
    </section>
  )
}

function LocalPriceCard({ item }: { item: LocalPriceProduct }) {
  const [showAll, setShowAll] = useState(false)
  const [flagged, setFlagged] = useState<Record<number, string>>({})
  const produce = item.product.type === 'nong_san'
  const compare = compareToReference(item.median, item.reference?.price, item.product.type)
  const entries = showAll ? item.entries : item.entries.slice(0, 3)

  const flag = async (id: number) => {
    if (!window.confirm('Báo giá này sai (không đúng giá thực tế)? Đủ nhiều người báo thì giá sẽ được kiểm tra lại.')) return
    const message = await api.flagLocalPrice(id).catch((e: Error) => e.message)
    setFlagged({ ...flagged, [id]: message })
  }

  return (
    <section className="card local-price">
      <header className="card-head">
        <h2>
          <a href={href(`san-pham/${item.product.code}`)}>{item.product.name}</a>
        </h2>
        <span className="small muted">
          {item.count} điểm {produce ? 'mua' : 'bán'} · {formatDate(item.latest_date, true)}
        </span>
      </header>
      <div className="local-summary">
        <div>
          <p className="small muted">Giá giữa</p>
          <p className="big">
            {formatVnd(item.median)}
            <span className="small muted">/{item.product.unit}</span>
          </p>
          {item.count > 1 && (
            <p className="small muted">
              {formatVnd(item.min)} – {formatVnd(item.max)}
            </p>
          )}
        </div>
        {item.reference && (
          <div className="reference">
            <p className="small muted">Giá chung {item.reference.region}</p>
            <p>{formatVnd(item.reference.price)}</p>
            {compare && compare.diff !== 0 && (
              <p className={`small ${compare.good ? 'in' : 'out'}`}>
                Quanh đây {compare.diff > 0 ? 'cao' : 'thấp'} hơn {Math.abs(compare.percent)}% ({compare.diff > 0 ? '+' : '-'}
                {formatVnd(Math.abs(compare.diff))})
              </p>
            )}
          </div>
        )}
      </div>
      <p className="small muted">{produce ? 'Điểm trả giá cao xếp trước' : 'Điểm bán rẻ xếp trước'}</p>
      <div className="entries">
        {entries.map((e) => (
          <div key={e.id} className="local-entry">
            <div className="local-entry-main">
              <b>
                {e.buyer.name}
                {e.buyer.is_verified && (
                  <span className="badge" title="Đã xác minh">
                    ✓
                  </span>
                )}
              </b>
              <span className="small muted">
                {e.buyer.kind_label} · {formatDistance(e.distance_km)} · {formatDate(e.date, true)}
                {e.note ? ` · ${e.note}` : ''}
              </span>
              {flagged[e.id] && <span className="small muted">{flagged[e.id]}</span>}
            </div>
            <span className="local-entry-price">{formatVnd(e.price)}</span>
            <div className="actions">
              <a className="button primary" href={telHref(e.buyer.phone)}>
                📞 Gọi
              </a>
              {!flagged[e.id] && (
                <button type="button" className="subtle-danger" onClick={() => flag(e.id)}>
                  Báo giá sai
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {item.entries.length > 3 && (
        <button type="button" className="linklike" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Thu gọn' : `Xem cả ${item.entries.length} điểm ›`}
        </button>
      )}
    </section>
  )
}

/** Điểm thu mua, bán phân, bán thuốc gần khu vực của tôi */
function NearbyServices() {
  const location = useMyLocation()!
  const [state, retry] = useAsync(() => api.shops({ lat: location.lat, lng: location.lng, radius: location.radius }), [location.lat, location.lng, location.radius])
  return (
    <>
      <h2 className="section">🏪 Dịch vụ quanh đây</h2>
      <Status state={state} retry={retry} />
      {state.status === 'ok' && state.data.data.length === 0 && <div className="notice">Chưa có điểm bán / thu mua nào trong {location.radius} km.</div>}
      {state.status === 'ok' &&
        state.data.data.slice(0, 6).map((s) => (
          <a key={s.id} className="card garden-row" href={href('diem-ban', { q: s.name })}>
            <span className="garden-name">
              {s.name}
              {s.is_verified && <span className="badge">✓</span>}
              <span className="small muted"> · {s.types.map((t) => SHOP_TYPE_LABELS[t]).join(', ')}</span>
            </span>
            <span className="small muted nowrap">{s.distance_km !== undefined ? formatDistance(s.distance_km) : ''}</span>
          </a>
        ))}
      {state.status === 'ok' && state.data.meta.total > 6 && (
        <a className="button" href={href('diem-ban')}>
          Xem cả {state.data.meta.total} điểm ›
        </a>
      )}
    </>
  )
}
