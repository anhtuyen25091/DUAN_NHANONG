import { addDays, calendarCells, formatDateLong, today } from '@nhanong/shared'
import { useId, useRef, useState } from 'react'

/** Lịch tuần bắt đầu từ Thứ 2, như lịch treo tường ở Việt Nam (giống app) */
const WEEK_HEAD = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

/**
 * Ô chọn ngày tiếng Việt: hiện "Thứ Năm, 15/10/2026", bấm mở lịch.
 * Thay cho <input type="date"> (mỗi trình duyệt hiện một kiểu, có máy hiện tiếng Anh, tháng/ngày đảo).
 * value: "YYYY-MM-DD", hoặc "" khi optional và chưa chọn.
 */
export function DateField({
  label,
  value,
  onChange,
  optional,
  max,
  min,
  placeholder = 'Chọn ngày',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  optional?: boolean
  max?: string
  min?: string
  placeholder?: string
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const labelId = useId()
  const now = today()
  const shown = value || (max && max < now ? max : now)
  const [view, setView] = useState({ y: Number(shown.slice(0, 4)), m: Number(shown.slice(5, 7)) })

  const allowed = (d: string) => (!max || d <= max) && (!min || d >= min)
  const quick = [
    { label: 'Hôm nay', date: now },
    { label: 'Hôm qua', date: addDays(now, -1) },
  ].filter((q) => allowed(q.date))

  const open = () => {
    setView({ y: Number(shown.slice(0, 4)), m: Number(shown.slice(5, 7)) })
    dialog.current?.showModal()
  }
  const close = () => dialog.current?.close()
  const pick = (d: string) => {
    onChange(d)
    close()
  }
  const move = (delta: number) => {
    const d = new Date(view.y, view.m - 1 + delta, 1)
    setView({ y: d.getFullYear(), m: d.getMonth() + 1 })
  }
  const canPrev = !min || iso(view.y, view.m, 1) > min
  const canNext = !max || iso(view.y, view.m, new Date(view.y, view.m, 0).getDate()) < max

  return (
    <div className="field" role="group" aria-labelledby={labelId}>
      <span id={labelId}>{label}</span>
      <div className="date-row">
        <button type="button" className="date-button" onClick={open} aria-label={value ? `${label}: ${formatDateLong(value)}, bấm để đổi` : `${label}: ${placeholder}`}>
          <span aria-hidden>📅</span> <span className={value ? '' : 'muted'}>{value ? formatDateLong(value) : placeholder}</span>
        </button>
        {quick.map((q) => (
          <button key={q.label} type="button" className={value === q.date ? 'active' : ''} aria-pressed={value === q.date} onClick={() => onChange(q.date)}>
            {q.label}
          </button>
        ))}
      </div>

      {/* Bấm ra ngoài lịch (vùng nền) thì đóng */}
      <dialog ref={dialog} className="calendar" aria-label={`Chọn ${label.toLowerCase()}`} onClick={(e) => e.target === dialog.current && close()}>
        <div className="calendar-head">
          <button type="button" className="calendar-nav" onClick={() => move(-1)} disabled={!canPrev} aria-label="Tháng trước">
            ‹
          </button>
          <b>
            Tháng {view.m}/{view.y}
          </b>
          <button type="button" className="calendar-nav" onClick={() => move(1)} disabled={!canNext} aria-label="Tháng sau">
            ›
          </button>
        </div>
        <div className="calendar-grid">
          {WEEK_HEAD.map((w) => (
            <span key={w} className={`calendar-week${w === 'CN' ? ' sunday' : ''}`}>
              {w}
            </span>
          ))}
          {calendarCells(view.y, view.m).map((day, i) => {
            if (day === null) return <span key={`e${i}`} />
            const d = iso(view.y, view.m, day)
            const ok = allowed(d)
            const cls = ['calendar-day', d === value && 'selected', d === now && 'today', i % 7 === 6 && 'sunday'].filter(Boolean).join(' ')
            return (
              <button key={d} type="button" className={cls} disabled={!ok} aria-label={formatDateLong(d)} aria-pressed={d === value} onClick={() => pick(d)}>
                {day}
              </button>
            )
          })}
        </div>
        <div className="actions calendar-actions">
          {allowed(now) && (
            <button type="button" onClick={() => pick(now)}>
              Hôm nay
            </button>
          )}
          {optional && value !== '' && (
            <button type="button" onClick={() => pick('')}>
              Bỏ ngày
            </button>
          )}
          <button type="button" onClick={close}>
            Đóng
          </button>
        </div>
      </dialog>
    </div>
  )
}
