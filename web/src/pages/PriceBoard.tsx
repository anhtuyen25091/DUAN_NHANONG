import { CATEGORY_TYPE_LABELS, describeLocation, groupByProduct, matchesSearch, pinFollowed, type CategoryType } from '@nhanong/shared'
import { useState } from 'react'
import { api } from '../api'
import { ProductPriceCard } from '../components/ProductPriceCard'
import { Status } from '../components/Status'
import { href, replaceQuery, useAsync } from '../hooks'
import { useFollowed } from '../followed'
import { useMyLocation } from '../myLocation'

const TYPES = Object.keys(CATEGORY_TYPE_LABELS) as CategoryType[]

export function PriceBoard({ query }: { query: URLSearchParams }) {
  const type = (TYPES.find((t) => t === query.get('type')) ?? 'nong_san') as CategoryType
  const region = query.get('region') ?? ''
  const [search, setSearch] = useState('')

  const [regions] = useAsync(() => api.regions(), [])
  const [prices, retry] = useAsync(() => api.prices({ type, region }), [type, region])

  const setFilter = (next: { type?: string; region?: string }) => replaceQuery('', { type, region, ...next })

  const rows = prices.status === 'ok' ? prices.data.data.filter((row) => matchesSearch(row, search)) : []
  const followed = useFollowed()
  const groups = pinFollowed(groupByProduct(rows), followed)
  const followedCount = groups.filter((g) => followed.includes(g.product.code)).length

  return (
    <>
      <section className="hero">
        <p className="hero-date">{new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric' })}</p>
        <h1>Giá nông sản hôm nay</h1>
        <p>{groups.length > 0 ? `${groups.length} mặt hàng · cập nhật mỗi ngày` : 'Cập nhật mỗi ngày từ nguồn tin cậy'}</p>
      </section>
      <LocalBanner />
      <nav className="tabs" aria-label="Nhóm hàng">
        {TYPES.map((t) => (
          <button key={t} type="button" className={t === type ? 'active' : ''} aria-pressed={t === type} onClick={() => setFilter({ type: t })}>
            {CATEGORY_TYPE_LABELS[t]}
          </button>
        ))}
      </nav>

      <div className="filters">
        <input type="search" placeholder="Tìm mặt hàng, tỉnh…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Tìm kiếm" />
        <select value={region} onChange={(e) => setFilter({ region: e.target.value })} aria-label="Khu vực">
          <option value="">Mọi khu vực</option>
          {regions.status === 'ok' &&
            regions.data.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name}
              </option>
            ))}
        </select>
      </div>

      <Status state={prices} retry={retry} />

      {prices.status === 'ok' && groups.length === 0 && (
        <div className="notice">
          {search
            ? 'Không tìm thấy mặt hàng phù hợp.'
            : type === 'thuoc_bvtv'
              ? 'Chưa có nguồn giá thuốc BVTV. Chúng tôi đang tìm nguồn đáng tin cậy.'
              : 'Chưa có giá trong 14 ngày gần đây.'}
        </div>
      )}

      {prices.status === 'ok' && groups.length > 0 && followedCount === 0 && !search && (
        <p className="hint">⭐ Bấm ☆ ở mặt hàng bạn trồng để đưa lên đầu trang, lần sau mở là thấy ngay.</p>
      )}
      {groups.map(({ product, rows }, i) => (
        <div key={product.code}>
          {followedCount > 0 && i === 0 && <h2 className="section-title">⭐ Mặt hàng bạn theo dõi</h2>}
          {followedCount > 0 && i === followedCount && <h2 className="section-title">Các mặt hàng khác</h2>}
          <ProductPriceCard product={product} rows={rows} followed={followed.includes(product.code)} region={region} expanded={search.trim() !== '' || region !== ''} />
        </div>
      ))}
    </>
  )
}

/** Lối vào "Giá quanh tôi": giá các điểm mua quanh khu vực của tôi */
function LocalBanner() {
  const location = useMyLocation()
  return (
    <a className="card local-banner" href={href('gia-quanh-toi')}>
      <span>
        <b>📍 Giá quanh tôi</b>
        <br />
        <span className="small muted">{location ? describeLocation(location) : 'Chọn khu vực để xem giá các điểm mua gần bạn'}</span>
      </span>
      <span aria-hidden>›</span>
    </a>
  )
}
