import { formatNumber, formatPriceRange, relativeDay, summarizeProduct, type PriceRow } from '@nhanong/shared'
import { useState } from 'react'
import { toggleFollow } from '../followed'
import { href } from '../hooks'
import { Change } from './Change'

/**
 * 1 mặt hàng trên bảng giá, thu gọn: khoảng giá các vùng + xu hướng chung + ngày; bấm "Xem giá N vùng" mới mở từng vùng.
 * Nút ☆ ghim mặt hàng mình trồng lên đầu.
 */
export function ProductPriceCard({ product, rows, followed, region, expanded: forceOpen }: { product: PriceRow['product']; rows: PriceRow[]; followed: boolean; region: string; expanded?: boolean }) {
  const [open, setOpen] = useState(false)
  const s = summarizeProduct(rows)
  const single = rows.length === 1
  const expanded = !single && (forceOpen || open)
  const unit = rows[0]?.unit ?? product.unit
  const chart = href(`san-pham/${product.code}`, { region })

  return (
    <section className={`card price-card${followed ? ' followed' : ''}`}>
      <header className="price-card-head">
        <button type="button" className="follow" aria-pressed={followed} aria-label={followed ? 'Bỏ theo dõi' : 'Theo dõi mặt hàng này'} onClick={() => toggleFollow(product.code)}>
          {followed ? '★' : '☆'}
        </button>
        <h2>
          <a href={chart}>{product.name}</a>
        </h2>
        <a className="chart-link" href={chart} aria-label={`Biểu đồ giá ${product.name}`}>
          📈
        </a>
      </header>

      <a className="price-headline" href={chart}>
        <span className="price-big">{s.min === s.max ? formatNumber(s.max) : `${formatNumber(s.min)} – ${formatNumber(s.max)}`}</span>
        <span className="price-unit"> đ/{unit}</span>
      </a>
      <div className="price-meta">
        <Change value={s.change} />
        <span className="muted">
          {single && <b className="region-name">{rows[0].region.name} · </b>}
          {relativeDay(s.date)}
          {rows.length > 1 && s.change !== null && ` · ${[s.up && `${s.up} vùng tăng`, s.down && `${s.down} vùng giảm`, s.flat && `${s.flat} vùng giữ giá`].filter(Boolean).join(', ')}`}
        </span>
      </div>

      {rows.length > 1 && !forceOpen && (
        <button type="button" className="expand" aria-expanded={expanded} onClick={() => setOpen(!open)}>
          {expanded ? 'Thu gọn ▴' : `Xem giá ${rows.length} vùng ▾`}
        </button>
      )}

      {single && <p className="small muted source-line">Nguồn: {s.sources.join(', ')}</p>}

      {expanded && (
        <>
          <ul className="region-prices">
            {rows.map((row) => (
              <li key={row.region.code}>
                <a href={href(`san-pham/${product.code}`, { region: row.region.code })}>{row.region.name}</a>
                <span className="region-price">
                  <b>{formatPriceRange(row)}</b>
                  <Change value={row.change} />
                </span>
              </li>
            ))}
          </ul>
          <p className="small muted source-line">Nguồn: {s.sources.join(', ')}</p>
        </>
      )}
    </section>
  )
}
