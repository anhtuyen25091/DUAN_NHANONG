import { formatDate, formatNumber, type HistoryPoint } from '@nhanong/shared'
import { useState } from 'react'

// Khung nhỏ để chữ trên trục gần cỡ thật khi xem trên điện thoại
const W = 360
const H = 200
const PAD = { top: 10, right: 10, bottom: 22, left: 54 }

/** Nhãn 1 điểm: ngày, "tuần từ 13/10/2025" hoặc "tháng 10/2025" */
function pointLabel(date: string, interval: Interval): string {
  if (interval === 'month') return `tháng ${Number(date.slice(5, 7))}/${date.slice(0, 4)}`
  if (interval === 'week') return `tuần từ ${formatDate(date)}`
  return formatDate(date)
}

type Interval = 'day' | 'week' | 'month'

/** Biểu đồ đường giá trung bình + dải thấp–cao. Chạm/rê chuột để xem giá từng ngày (từng tuần / tháng khi xem khoảng dài). */
export function PriceChart({ points, unit, interval = 'day' }: { points: HistoryPoint[]; unit: string; interval?: Interval }) {
  const [active, setActive] = useState<number | null>(null)

  if (points.length === 0) return <p className="muted center">Chưa có dữ liệu trong khoảng này.</p>
  if (points.length === 1)
    return (
      <p className="muted center">
        Mới có giá {interval === 'day' ? `ngày ${formatDate(points[0].date)}` : pointLabel(points[0].date, interval)}: <strong>{formatNumber(points[0].avg)} đ/{unit}</strong>. Biểu đồ sẽ hiện khi có thêm
        ngày.
      </p>
    )

  const values = points.flatMap((p) => [p.min, p.max])
  let lo = Math.min(...values)
  let hi = Math.max(...values)
  const margin = Math.max((hi - lo) * 0.1, hi * 0.01, 1)
  lo -= margin
  hi += margin

  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (i / (points.length - 1)) * innerW
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * innerH

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.avg).toFixed(1)}`).join('')
  const band =
    points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.max).toFixed(1)}`).join('') +
    [...points]
      .reverse()
      .map((p, i) => `L${x(points.length - 1 - i).toFixed(1)},${y(p.min).toFixed(1)}`)
      .join('') +
    'Z'

  const ticks = [0, 0.5, 1].map((t) => lo + (hi - lo) * t)
  const labelEvery = Math.max(1, Math.ceil(points.length / 5))
  const current = active === null ? null : points[active]

  function pick(clientX: number, rect: DOMRect) {
    const px = ((clientX - rect.left) / rect.width) * W
    const i = Math.round(((px - PAD.left) / innerW) * (points.length - 1))
    setActive(Math.min(points.length - 1, Math.max(0, i)))
  }

  return (
    <figure className="chart">
      <div className="chart-readout" aria-live="polite">
        {current ? (
          <>
            <strong>{pointLabel(current.date, interval)}</strong>: {formatNumber(current.avg)} đ/{unit}
            {current.min !== current.max && (
              <span className="muted">
                {' '}
                ({formatNumber(current.min)} – {formatNumber(current.max)})
              </span>
            )}
          </>
        ) : (
          <span className="muted">Chạm vào biểu đồ để xem giá từng ngày</span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Biểu đồ giá ${points.length} ngày`}
        onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerDown={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setActive(null)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="grid" />
            <text x={PAD.left - 8} y={y(v)} className="axis" textAnchor="end" dominantBaseline="middle">
              {formatNumber(v)}
            </text>
          </g>
        ))}
        {points.map(
          (p, i) =>
            ((i % labelEvery === 0 && points.length - 1 - i >= labelEvery / 2) || i === points.length - 1) && (
              <text
                key={p.date}
                x={x(i)}
                y={H - 6}
                className="axis"
                textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
              >
                {interval === 'day' ? formatDate(p.date, true) : `${p.date.slice(5, 7)}/${p.date.slice(2, 4)}`}
              </text>
            ),
        )}
        <path d={band} className="band" />
        <path d={line} className="line" />
        {points.length <= 31 && points.map((p, i) => <circle key={p.date} cx={x(i)} cy={y(p.avg)} r={2.5} className="dot" />)}
        {current && active !== null && (
          <g>
            <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={H - PAD.bottom} className="cursor" />
            <circle cx={x(active)} cy={y(current.avg)} r={5} className="dot active" />
          </g>
        )}
      </svg>
    </figure>
  )
}
