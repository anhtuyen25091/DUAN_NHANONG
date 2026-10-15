import { formatDate, formatNumber, formatPriceRange } from '@nhanong/shared'
import { api } from '../api'
import { Change } from '../components/Change'
import { PriceChart } from '../components/PriceChart'
import { Status } from '../components/Status'
import { href, replaceQuery, useAsync } from '../hooks'

const RANGES = [7, 30, 90]

export function ProductDetail({ code, query }: { code: string; query: URLSearchParams }) {
  const region = query.get('region') ?? ''
  const days = RANGES.includes(Number(query.get('days'))) ? Number(query.get('days')) : 30
  const setFilter = (next: { region?: string; days?: string }) =>
    replaceQuery(`san-pham/${code}`, { region, days: String(days), ...next })

  const [latest] = useAsync(() => api.prices({ product: code }), [code])
  const [history, retry] = useAsync(() => api.history(code, { region: region || null, days }), [code, region, days])

  const rows = latest.status === 'ok' ? latest.data.data : []
  const product = history.status === 'ok' ? history.data.product : rows[0]?.product
  const points = history.status === 'ok' ? history.data.points : []

  return (
    <>
      <a className="back" href={href('', {})}>
        ‹ Bảng giá
      </a>
      <h1>{product?.name ?? '…'}</h1>

      <div className="filters">
        <select value={region} onChange={(e) => setFilter({ region: e.target.value })} aria-label="Khu vực">
          <option value="">Trung bình các vùng</option>
          {rows.map((row) => (
            <option key={row.region.code} value={row.region.code}>
              {row.region.name}
            </option>
          ))}
        </select>
        <div className="segmented" role="group" aria-label="Khoảng thời gian">
          {RANGES.map((d) => (
            <button key={d} type="button" className={d === days ? 'active' : ''} aria-pressed={d === days} onClick={() => setFilter({ days: String(d) })}>
              {d} ngày
            </button>
          ))}
        </div>
      </div>

      <section className="card">
        <Status state={history} retry={retry} />
        {history.status === 'ok' && <PriceChart points={points} unit={product?.unit ?? 'kg'} />}
      </section>

      {rows.length > 0 && (
        <section className="card">
          <h2>Giá mới nhất theo vùng</h2>
          <table className="prices">
            <tbody>
              {rows.map((row) => (
                <tr key={row.region.code} className={row.region.code === region ? 'selected' : ''}>
                  <td>
                    <button type="button" className="linklike" onClick={() => setFilter({ region: row.region.code })}>
                      {row.region.name}
                    </button>
                    <div className="small muted">{formatDate(row.date)}</div>
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
      )}

      {points.length > 0 && (
        <section className="card">
          <h2>Giá từng ngày</h2>
          <table className="prices">
            <thead>
              <tr>
                <th>Ngày</th>
                <th className="num">Trung bình</th>
                <th className="num">Thấp – cao</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.date}>
                  <td className="nowrap">{formatDate(p.date)}</td>
                  <td className="num price">{formatNumber(p.avg)}</td>
                  <td className="num muted">{formatPriceRange({ price_min: p.min, price_max: p.max })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <p className="notice small">Muốn nhận báo khi giá thay đổi? Cài app Nhà Nông trên điện thoại để đặt cảnh báo giá.</p>
    </>
  )
}
