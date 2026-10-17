import { directionsUrl, formatDistance, geoNote, SHOP_TYPE_LABELS, telHref, type Shop, type ShopPage, type ShopType } from '@nhanong/shared'
import { lazy, Suspense, useEffect, useState } from 'react'
import { api } from '../api'
import { Status } from '../components/Status'
import { href, replaceQuery, useAsync } from '../hooks'

// Leaflet chỉ tải khi mở bản đồ
const ShopMap = lazy(() => import('./ShopMap'))

const TYPES = Object.keys(SHOP_TYPE_LABELS) as ShopType[]

type Position = { lat: number; lng: number }

export function ShopList({ query }: { query: URLSearchParams }) {
  const type = TYPES.find((t) => t === query.get('type'))
  const province = query.get('province') ?? ''
  const q = query.get('q') ?? ''
  const onMap = query.get('xem') === 'ban-do'
  const [search, setSearch] = useState(q)
  const [position, setPosition] = useState<Position | null>(null)
  const [locating, setLocating] = useState<string | null>(null)
  const [more, setMore] = useState<{ shops: Shop[]; page: number; hasMore: boolean } | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const setFilter = (next: { type?: string; province?: string; q?: string; xem?: string }) =>
    replaceQuery('diem-ban', { type, province, q, xem: onMap ? 'ban-do' : undefined, ...next })

  // Gõ xong 0,4 giây mới tìm, đỡ gọi server liên tục
  useEffect(() => {
    if (search === q) return
    const timer = setTimeout(() => setFilter({ q: search.trim() }), 400)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const filters = { type, q, ...(position ? position : { province }) }
  const [first, retry] = useAsync(() => {
    setMore(null)
    // Đang xem bản đồ thì bản đồ tự tải (lấy nhiều điểm 1 lần), danh sách không cần tải
    return onMap ? Promise.resolve(null) : api.shops(filters)
  }, [type, province, q, position?.lat, position?.lng, onMap])

  const nearMe = () => {
    if (position) return setPosition(null)
    if (!navigator.geolocation) return setLocating('Trình duyệt không hỗ trợ lấy vị trí.')
    setLocating('Đang lấy vị trí…')
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(null)
        setPosition({ lat: Math.round(p.coords.latitude * 1e4) / 1e4, lng: Math.round(p.coords.longitude * 1e4) / 1e4 })
      },
      () => setLocating('Không lấy được vị trí. Hãy cho phép trình duyệt dùng vị trí, hoặc chọn tỉnh.'),
      { timeout: 15000, maximumAge: 300000 },
    )
  }

  const loadMore = async (current: ShopPage) => {
    const page = (more?.page ?? current.meta.page) + 1
    setLoadingMore(true)
    try {
      const next = await api.shops({ ...filters, page })
      setMore({ shops: [...(more?.shops ?? []), ...next.data], page, hasMore: next.meta.has_more })
    } finally {
      setLoadingMore(false)
    }
  }

  const [provinces] = useAsync(() => api.provinces(), [])

  const page = first.status === 'ok' ? first.data : null
  const shops = page ? [...page.data, ...(more?.shops ?? [])] : []
  const hasMore = !!page && (more ? more.hasMore : page.meta.has_more)

  return (
    <>
      <div className="title-row">
        <h1>Điểm bán · thu mua</h1>
        <a className="button" href={href('diem-ban/de-xuat')}>
          ＋ Thêm điểm
        </a>
      </div>

      <div className={onMap ? 'shop-controls compact' : 'shop-controls'}>
        <nav className="segmented view-switch" aria-label="Cách xem">
          <button type="button" className={!onMap ? 'active' : ''} aria-pressed={!onMap} onClick={() => setFilter({ xem: '' })}>
            📋 Danh sách
          </button>
          <button type="button" className={onMap ? 'active' : ''} aria-pressed={onMap} onClick={() => setFilter({ xem: 'ban-do' })}>
            🗺 Bản đồ
          </button>
        </nav>

        <nav className="tabs" aria-label="Loại điểm">
          <button type="button" className={!type ? 'active' : ''} aria-pressed={!type} onClick={() => setFilter({ type: '' })}>
            Tất cả
          </button>
          {TYPES.map((t) => (
            <button key={t} type="button" className={t === type ? 'active' : ''} aria-pressed={t === type} onClick={() => setFilter({ type: t })}>
              {SHOP_TYPE_LABELS[t]}
            </button>
          ))}
        </nav>

        <div className="filters">
          <input type="search" placeholder="Tìm tên, địa chỉ, mặt hàng…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Tìm kiếm" />
          <button type="button" className={position ? 'active-toggle' : ''} aria-pressed={!!position} onClick={nearMe}>
            📍 {position ? 'Đang xem gần tôi' : 'Gần tôi'}
          </button>
          {!position && (
            <select value={province} onChange={(e) => setFilter({ province: e.target.value })} aria-label="Tỉnh/thành">
              <option value="">Mọi tỉnh/thành</option>
              {provinces.status === 'ok' &&
                provinces.data.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name}
                    {p.shops ? ` (${p.shops})` : ''}
                  </option>
                ))}
            </select>
          )}
        </div>
      </div>

      {locating && <p className="muted small">{locating}</p>}

      {onMap && (
        <Suspense fallback={<p className="muted">Đang mở bản đồ…</p>}>
          <ShopMap filters={filters} position={position} />
        </Suspense>
      )}

      {!onMap && <Status state={first} retry={retry} />}

      {page && (
        <p className="muted small">
          {page.meta.total} điểm{position && page.meta.radius_km ? ` trong vòng ${page.meta.radius_km} km` : ''}
        </p>
      )}

      {page && shops.length === 0 && (
        <div className="notice">
          Chưa có điểm nào phù hợp. Bạn biết một đại lý hay điểm thu mua? <a href={href('diem-ban/de-xuat')}>Thêm điểm</a> để mọi người cùng biết.
        </div>
      )}

      {shops.map((shop) => (
        <ShopCard key={shop.id} shop={shop} />
      ))}

      {hasMore && page && (
        <button type="button" className="wide" disabled={loadingMore} onClick={() => loadMore(page)}>
          {loadingMore ? 'Đang tải…' : 'Xem thêm'}
        </button>
      )}
    </>
  )
}

function ShopCard({ shop }: { shop: Shop }) {
  return (
    <article className="card shop">
      <header className="card-head">
        <h2>
          {shop.name}
          {shop.is_verified && (
            <span className="badge" title="Đã kiểm tra thông tin">
              ✓ Đã xác minh
            </span>
          )}
        </h2>
        {shop.distance_km !== undefined && <span className="nowrap muted">{formatDistance(shop.distance_km)}</span>}
      </header>
      <p className="small muted">{shop.types.map((t) => SHOP_TYPE_LABELS[t]).join(' · ')}</p>
      {(shop.address || shop.province_name) && <p>{[shop.address, shop.province_name].filter(Boolean).join(', ')}</p>}
      {shop.goods && <p className="small">Mặt hàng: {shop.goods}</p>}
      {shop.opening_hours && <p className="small muted">Giờ mở cửa: {shop.opening_hours}</p>}
      <div className="actions">
        {shop.phone && (
          <a className="button primary" href={telHref(shop.phone)}>
            📞 {shop.phone}
          </a>
        )}
        <a className="button" href={directionsUrl(shop)} target="_blank" rel="noreferrer">
          🧭 Chỉ đường
        </a>
        <a className="button subtle" href={href('diem-ban/de-xuat', { sua: String(shop.id), ten: shop.name })}>
          Báo sai
        </a>
      </div>
      {geoNote(shop.geo_precision) && <p className="small muted">{geoNote(shop.geo_precision)}</p>}
      {shop.source && (
        <p className="small muted">
          Nguồn: {shop.source} · <a href={href('diem-ban/xin-go', { id: String(shop.id), ten: shop.name })}>Chủ điểm? Xin gỡ</a>
        </p>
      )}
    </article>
  )
}
