import { ApiError, formatDate, formatNumber, formatPriceRange, type AccessTier } from '@nhanong/shared'
import { useEffect } from 'react'
import { api } from '../api'
import { setAuth, updateAuthUser, useAuth } from '../auth'
import { Change } from '../components/Change'
import { PriceChart } from '../components/PriceChart'
import { Status } from '../components/Status'
import { href, replaceQuery, useAsync } from '../hooks'
import { LocalPriceForProduct } from './LocalPrices'

const RANGES: Array<{ days: number; label: string }> = [
  { days: 10, label: '10 ngày' },
  { days: 30, label: '30 ngày' },
  { days: 90, label: '3 tháng' },
  { days: 365, label: '1 năm' },
  { days: 1827, label: '5 năm' },
]

/** Xem được bao nhiêu ngày theo mức tài khoản (khớp config/nhanong.php của backend) */
const TIER_DAYS: Record<AccessTier, number> = { guest: 10, member: 30, premium: Infinity }

export function ProductDetail({ code, query }: { code: string; query: URLSearchParams }) {
  const auth = useAuth()
  const tier: AccessTier = auth?.user.tier ?? (auth ? 'member' : 'guest')
  const region = query.get('region') ?? ''
  const asked = Number(query.get('days'))
  const days = RANGES.some((r) => r.days === asked) ? asked : tier === 'guest' ? 10 : 30
  const setFilter = (next: { region?: string; days?: string }) =>
    replaceQuery(`san-pham/${code}`, { region, days: String(days), ...next })
  const locked = (d: number) => d > TIER_DAYS[tier]

  const [latest] = useAsync(() => api.prices({ product: code }), [code])
  const [history, retry] = useAsync(
    () =>
      api.history(code, { region: region || null, days, token: auth?.token }).catch((error) => {
        // Token hết hạn / bị hủy: đăng xuất trên máy rồi xem như khách
        if (error instanceof ApiError && error.status === 401 && auth) {
          setAuth(null)
          return api.history(code, { region: region || null, days })
        }
        throw error
      }),
    [code, region, days, auth?.token],
  )
  // Mức xem thật do server trả về (admin vừa kích hoạt gói…)
  const served = history.status === 'ok' ? history.data.access.tier : null
  useEffect(() => {
    // Lấy lại đủ thông tin tài khoản (mức xem + hạn gói) khi server báo mức xem khác
    if (auth && served && served !== 'guest' && served !== auth.user.tier) api.me(auth.token).then(updateAuthUser, () => {})
  }, [auth, served])

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
          {RANGES.map((r) => (
            <button key={r.days} type="button" className={r.days === days ? 'active' : ''} aria-pressed={r.days === days} onClick={() => setFilter({ days: String(r.days) })}>
              {locked(r.days) && '🔒 '}
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {history.status === 'ok' && history.data.access.limited && (
        <UpgradeNotice tier={history.data.access.tier} back={`san-pham/${code}?days=${days}${region ? `&region=${region}` : ''}`} firstDate={history.data.access.first_date} />
      )}

      <section className="card">
        <Status state={history} retry={retry} />
        {history.status === 'ok' && <PriceChart points={points} unit={product?.unit ?? 'kg'} interval={history.data.interval} />}
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
          <h2>{history.status === 'ok' && history.data.interval !== 'day' ? `Giá trung bình từng ${history.data.interval === 'week' ? 'tuần' : 'tháng'}` : 'Giá từng ngày'}</h2>
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
                  <td className="nowrap">
                    {history.status === 'ok' && history.data.interval === 'month' ? `Tháng ${Number(p.date.slice(5, 7))}/${p.date.slice(0, 4)}` : formatDate(p.date)}
                  </td>
                  <td className="num price">{formatNumber(p.avg)}</td>
                  <td className="num muted">{formatPriceRange({ price_min: p.min, price_max: p.max })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <LocalPriceForProduct code={code} />

      <p className="notice small">Muốn nhận báo khi giá thay đổi? Cài app Nhà Nông trên điện thoại để đặt cảnh báo giá.</p>
    </>
  )
}

/** Khoảng xem bị giới hạn: mời đăng ký (khách) hoặc mua gói (thành viên) */
function UpgradeNotice({ tier, back, firstDate }: { tier: AccessTier; back: string; firstDate: string | null }) {
  const since = firstDate ? ` (có dữ liệu từ ${formatDate(firstDate)})` : ''
  return (
    <div className="notice upgrade">
      {tier === 'guest' ? (
        <>
          <p>
            Bạn đang xem <b>{TIER_DAYS.guest} ngày gần nhất</b>. Đăng ký miễn phí để xem {TIER_DAYS.member} ngày; mua gói để xem toàn bộ lịch sử giá{since}.
          </p>
          <a className="button primary" href={href('tai-khoan', { ve: back })}>
            Đăng ký / Đăng nhập
          </a>
        </>
      ) : (
        <>
          <p>
            Tài khoản thường xem được <b>{TIER_DAYS.member} ngày gần nhất</b>. Mua gói tháng / năm để xem toàn bộ lịch sử giá{since}.
          </p>
          <a className="button primary" href={href('tai-khoan', { ve: back })}>
            Xem các gói
          </a>
        </>
      )}
    </div>
  )
}
