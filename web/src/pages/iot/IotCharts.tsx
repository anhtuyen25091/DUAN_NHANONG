import { formatDecimal, pointValue, rainOfDay, type IotPoint, type IotRainfall } from '@nhanong/shared'
import { useState } from 'react'

const W = 640
const H = 220
const PAD = { top: 12, right: 10, bottom: 24, left: 46 }

function timeLabel(iso: string, withDate = false): string {
  const d = new Date(iso)
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return withDate ? `${time} ${d.getDate()}/${d.getMonth() + 1}` : time
}

/** Việc làm vườn đánh dấu trên biểu đồ (phun thuốc, bón phân…); faint: tưới (nhiều, vẽ nhỏ và mờ) */
export interface ChartMarker {
  t: string
  icon: string
  /** Chữ khi di chuột: "🧴 Phun thuốc: Regent" */
  label: string
  /** Tên việc (dòng chú thích dưới biểu đồ) */
  title: string
  faint?: boolean
}

/** Đường số đo (trung bình nếu đã gộp) + dải thấp–cao + vạch ngưỡng + việc làm vườn; di chuột / chạm để xem từng điểm */
export function IotLineChart({
  points,
  unit,
  min,
  max,
  daily,
  markers = [],
}: {
  points: IotPoint[]
  unit: string | null
  min: number | null
  max: number | null
  daily: boolean
  markers?: ChartMarker[]
}) {
  const [active, setActive] = useState<number | null>(null)
  if (points.length === 0) return <p className="muted">Chưa có số đo trong khoảng này.</p>

  const values = points.flatMap((p) => ('avg' in p ? [p.min, p.max] : [p.value]))
  const limits = [min, max].filter((v): v is number => v !== null)
  let lo = Math.min(...values, ...limits)
  let hi = Math.max(...values, ...limits)
  const margin = Math.max((hi - lo) * 0.1, Math.abs(hi) * 0.01, 0.1)
  lo -= margin
  hi += margin
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW)
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * innerH
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(pointValue(p))}`).join('')
  const band = points.every((p) => 'avg' in p)
    ? points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y((p as { max: number }).max)}`).join('') +
      [...points.keys()].reverse().map((i) => `L${x(i)},${y((points[i] as { min: number }).min)}`).join('') +
      'Z'
    : null
  const current = active === null ? null : points[active]
  // Trục ngang theo thứ tự điểm: đặt vạch việc làm vườn theo thời gian, nội suy giữa 2 điểm kề nhau
  const times = points.map((p) => new Date(p.t).getTime())
  const xAt = (iso: string): number | null => {
    const t = new Date(iso).getTime()
    if (points.length < 2 || t < times[0] || t > times[times.length - 1]) return null
    let i = 0
    while (i < times.length - 2 && times[i + 1] < t) i++
    const span = times[i + 1] - times[i]
    return x(i) + (span > 0 ? (t - times[i]) / span : 0) * (x(i + 1) - x(i))
  }
  const placed = markers
    .map((m) => ({ ...m, x: xAt(m.t) }))
    .filter((m): m is ChartMarker & { x: number } => m.x !== null)
    // Tưới vẽ trước (nằm dưới)
    .sort((a, b) => Number(b.faint ?? false) - Number(a.faint ?? false))
  const outside = (v: number) => (min !== null && v < min) || (max !== null && v > max)
  const label = (iso: string, withDate = false) => (daily ? `${new Date(iso).getDate()}/${new Date(iso).getMonth() + 1}` : timeLabel(iso, withDate))

  return (
    <div>
      <p className="chart-readout">
        {current ? (
          <>
            <strong>{label(current.t, true)}</strong>:{' '}
            <strong style={{ color: outside(pointValue(current)) ? 'var(--danger, #c0262d)' : undefined }}>
              {formatDecimal(pointValue(current))}
              {unit ? ` ${unit}` : ''}
            </strong>
          </>
        ) : (
          <span className="muted">Di chuột / chạm vào biểu đồ để xem từng lần đo</span>
        )}
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="chart"
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect()
          const px = ((e.clientX - box.left) / box.width) * W
          setActive(Math.min(points.length - 1, Math.max(0, Math.round(((px - PAD.left) / innerW) * (points.length - 1)))))
        }}
        onMouseLeave={() => setActive(null)}
        role="img"
        aria-label={`Biểu đồ ${points.length} điểm`}
      >
        {[lo, (lo + hi) / 2, hi].map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="#e1e8de" />
            <text x={PAD.left - 6} y={y(v) + 4} fontSize="11" textAnchor="end" fill="#56675c">
              {formatDecimal(v)}
            </text>
          </g>
        ))}
        {limits.map((v) => (
          <line key={`l${v}`} x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="#c0262d" strokeDasharray="6 4" />
        ))}
        {band && <path d={band} fill="rgba(11, 122, 75, 0.14)" />}
        <path d={line} fill="none" stroke="#0b7a4b" strokeWidth={2} />
        <text x={PAD.left} y={H - 6} fontSize="11" fill="#56675c">
          {label(points[0].t)}
        </text>
        <text x={W - PAD.right} y={H - 6} fontSize="11" fill="#56675c" textAnchor="end">
          {label(points[points.length - 1].t)}
        </text>
        {placed.map((m) => (
          <g key={`${m.t}-${m.label}`} opacity={m.faint ? 0.45 : 1}>
            <title>{`${m.label} · ${label(m.t, true)}`}</title>
            <line x1={m.x} x2={m.x} y1={PAD.top + 4} y2={H - PAD.bottom} stroke={m.faint ? '#2b7bb9' : '#a16207'} strokeWidth={m.faint ? 1 : 1.5} strokeDasharray={m.faint ? '2 3' : undefined} />
            <text x={m.x} y={PAD.top + (m.faint ? 8 : 10)} fontSize={m.faint ? 9 : 14} textAnchor="middle">
              {m.icon}
            </text>
          </g>
        ))}
        {current && active !== null && <circle cx={x(active)} cy={y(pointValue(current))} r={5} fill={outside(pointValue(current)) ? '#c0262d' : '#0b7a4b'} />}
      </svg>
      {limits.length > 0 && <p className="small muted">Vạch đỏ đứt: ngưỡng an toàn</p>}
      {placed.some((m) => !m.faint) && (
        <p className="small muted">
          Việc làm vườn:{' '}
          {placed
            .filter((m) => !m.faint)
            .map((m) => `${m.icon} ${m.title} (${label(m.t, true)})`)
            .join(' · ')}
        </p>
      )}
      {placed.some((m) => m.faint) && <p className="small muted">💧 Vạch xanh mờ: lần tưới</p>}
    </div>
  )
}

/** Cột mưa từng ngày (1 năm thì gộp theo tuần) */
export function RainBars({ data }: { data: IotRainfall }) {
  const [active, setActive] = useState<number | null>(null)
  const step = data.days > 120 ? 7 : 1
  const bars: { label: string; mm: number | null }[] = []
  for (let i = 0; i < data.data.length; i += step) {
    const group = data.data.slice(i, i + step)
    const values = group.map(rainOfDay).filter((v): v is number => v !== null)
    const d = new Date(`${group[0].date}T00:00:00`)
    bars.push({ label: `${step > 1 ? 'tuần từ ' : ''}${d.getDate()}/${d.getMonth() + 1}`, mm: values.length ? values.reduce((a, b) => a + b, 0) : null })
  }
  const max = Math.max(5, ...bars.map((b) => b.mm ?? 0))
  const innerW = W - PAD.left - PAD.right
  const innerH = 160 - PAD.top - PAD.bottom
  const barW = innerW / bars.length
  const y = (v: number) => PAD.top + (1 - v / max) * innerH
  const current = active === null ? null : bars[active]

  return (
    <div>
      <p className="chart-readout">
        {current ? (
          <>
            <strong>{current.label}</strong>: {current.mm === null ? 'chưa có số liệu' : `${formatDecimal(current.mm)} mm`}
          </>
        ) : (
          <span className="muted">Di chuột / chạm vào cột để xem từng {step > 1 ? 'tuần' : 'ngày'}</span>
        )}
      </p>
      <svg
        viewBox={`0 0 ${W} 160`}
        className="chart"
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect()
          const px = ((e.clientX - box.left) / box.width) * W
          setActive(Math.min(bars.length - 1, Math.max(0, Math.floor((px - PAD.left) / barW))))
        }}
        onMouseLeave={() => setActive(null)}
        role="img"
        aria-label={`Lượng mưa ${data.days} ngày`}
      >
        {[0, max / 2, max].map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="#e1e8de" />
            <text x={PAD.left - 6} y={y(v) + 4} fontSize="11" textAnchor="end" fill="#56675c">
              {Math.round(v)}
            </text>
          </g>
        ))}
        {bars.map((b, i) =>
          b.mm ? <rect key={i} x={PAD.left + i * barW + barW * 0.15} y={y(b.mm)} width={Math.max(barW * 0.7, 1)} height={Math.max(PAD.top + innerH - y(b.mm), 1)} rx={2} fill={i === active ? '#0b7a4b' : '#2b7bb9'} /> : null,
        )}
        <text x={PAD.left} y={154} fontSize="11" fill="#56675c">
          {bars[0]?.label.replace('tuần từ ', '')}
        </text>
        <text x={W - PAD.right} y={154} fontSize="11" fill="#56675c" textAnchor="end">
          Hôm nay
        </text>
      </svg>
      <p className="small muted">mm mưa / {step > 1 ? 'tuần' : 'ngày'}</p>
    </div>
  )
}
