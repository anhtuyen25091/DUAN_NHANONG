import { parseVnd, readVnd, type EntryType, type LedgerSnapshot } from '@nhanong/shared'

/** "1500000" -> "1.500.000" để dễ đếm số 0 khi gõ */
function groupDigits(n: number): string {
  return n ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : ''
}

/** Ô nhập tiền: tự thêm dấu chấm, đọc thành chữ bên dưới ("1 triệu 500 nghìn đồng") */
export function MoneyField({ label, value, onChange, required }: { label: string; value: number; onChange: (v: number) => void; required?: boolean }) {
  return (
    <label>
      {label}
      <input inputMode="numeric" value={groupDigits(value)} onChange={(e) => onChange(Math.min(parseVnd(e.target.value), 999_999_999_999))} required={required} placeholder="0" />
      {value > 0 && <span className="small muted">{readVnd(value)}</span>}
    </label>
  )
}

/** Ô số lượng: giữ nguyên chữ người dùng gõ (để gõ được "2,"), trả số qua onChange */
export function QtyField({ label, text, onText, suffix }: { label: string; text: string; onText: (t: string) => void; suffix?: string }) {
  return (
    <label>
      {label}
      <span className="with-suffix">
        <input inputMode="decimal" value={text} onChange={(e) => onText(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="0" />
        {suffix && <span className="muted">{suffix}</span>}
      </span>
    </label>
  )
}

/** Chọn vườn bằng nút bấm; allowShared: có lựa chọn "Chi chung" (null) */
export function GardenPicker({ data, value, onChange, allowShared, legend = 'Vườn' }: { data: LedgerSnapshot; value: string | null; onChange: (id: string | null) => void; allowShared?: boolean; legend?: string }) {
  return (
    <fieldset>
      <legend>{legend}</legend>
      <div className="segmented wrap">
        {data.gardens.map((g) => (
          <button key={g.id} type="button" className={g.id === value ? 'active' : ''} aria-pressed={g.id === value} onClick={() => onChange(g.id)}>
            {g.name}
          </button>
        ))}
        {allowShared && (
          <button type="button" className={value === null ? 'active' : ''} aria-pressed={value === null} onClick={() => onChange(null)}>
            Chi chung
          </button>
        )}
      </div>
    </fieldset>
  )
}

/** Chọn hạng mục (icon + tên) theo loại tiền vào / tiền ra */
export function CategoryPicker({ data, type, value, onChange, legend = 'Hạng mục' }: { data: LedgerSnapshot; type: EntryType; value: string; onChange: (id: string) => void; legend?: string }) {
  return (
    <fieldset>
      <legend>{legend}</legend>
      <div className="segmented wrap">
        {data.categories
          .filter((c) => c.type === type)
          .map((c) => (
            <button key={c.id} type="button" className={c.id === value ? 'active' : ''} aria-pressed={c.id === value} onClick={() => onChange(c.id)}>
              {c.icon} {c.name}
            </button>
          ))}
      </div>
    </fieldset>
  )
}
