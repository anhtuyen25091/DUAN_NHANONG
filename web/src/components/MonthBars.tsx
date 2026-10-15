import { formatVnd, type Totals } from '@nhanong/shared'

/** Biểu đồ cột thu (xanh) / chi (đỏ) theo tháng */
export function MonthBars({ months }: { months: Array<Totals & { month: string }> }) {
  const max = Math.max(1, ...months.flatMap((m) => [m.income, m.expense]))
  const W = 320
  const H = 140
  const slot = W / months.length
  const bar = Math.min(18, slot / 3)
  const y = (v: number) => H - 20 - (v / max) * (H - 30)

  return (
    <figure className="bars">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Thu chi theo tháng">
        <line x1="0" x2={W} y1={H - 20} y2={H - 20} className="grid" />
        {months.map((m, i) => {
          const x = i * slot + slot / 2
          return (
            <g key={m.month}>
              <title>{`Tháng ${Number(m.month.slice(5))}: thu ${formatVnd(m.income)}, chi ${formatVnd(m.expense)}`}</title>
              <rect x={x - bar - 1} y={y(m.income)} width={bar} height={H - 20 - y(m.income)} rx="3" className="bar-in" />
              <rect x={x + 1} y={y(m.expense)} width={bar} height={H - 20 - y(m.expense)} rx="3" className="bar-out" />
              <text x={x} y={H - 5} textAnchor="middle" className="axis">
                T{Number(m.month.slice(5))}
              </text>
            </g>
          )
        })}
      </svg>
      <figcaption className="small muted">
        <span className="dot-in" /> Tiền vào <span className="dot-out" /> Tiền ra
      </figcaption>
    </figure>
  )
}
