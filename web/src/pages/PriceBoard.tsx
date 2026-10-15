import { CATEGORY_TYPE_LABELS, formatDate, formatPriceRange, groupByProduct, matchesSearch, type CategoryType } from '@nhanong/shared'
import { useState } from 'react'
import { api } from '../api'
import { Change } from '../components/Change'
import { Status } from '../components/Status'
import { href, replaceQuery, useAsync } from '../hooks'

const TYPES = Object.keys(CATEGORY_TYPE_LABELS) as CategoryType[]

export function PriceBoard({ query }: { query: URLSearchParams }) {
  const type = (TYPES.find((t) => t === query.get('type')) ?? 'nong_san') as CategoryType
  const region = query.get('region') ?? ''
  const [search, setSearch] = useState('')

  const [regions] = useAsync(() => api.regions(), [])
  const [prices, retry] = useAsync(() => api.prices({ type, region }), [type, region])

  const setFilter = (next: { type?: string; region?: string }) => replaceQuery('', { type, region, ...next })

  const rows = prices.status === 'ok' ? prices.data.data.filter((row) => matchesSearch(row, search)) : []
  const groups = groupByProduct(rows)

  return (
    <>
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

      {groups.map(({ product, rows }) => (
        <section key={product.code} className="card">
          <header className="card-head">
            <h2>
              <a href={href(`san-pham/${product.code}`, { region })}>{product.name}</a>
            </h2>
            <a className="link-chart" href={href(`san-pham/${product.code}`, { region })}>
              Biểu đồ ›
            </a>
          </header>
          <table className="prices">
            <thead>
              <tr>
                <th>Khu vực</th>
                <th className="num">Giá (đ/{product.unit})</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.region.code}>
                  <td>
                    <a href={href(`san-pham/${product.code}`, { region: row.region.code })}>{row.region.name}</a>
                    <div className="small muted">
                      {formatDate(row.date)} · {row.sources.join(', ')}
                    </div>
                  </td>
                  <td className="num">
                    <div className="price">{formatPriceRange(row)}</div>
                    <Change value={row.change} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </>
  )
}
