import { fieldLines, fieldsFor, type CustomFieldDef, type CustomFieldTarget } from '@nhanong/shared'
import { DateField } from '../../components/DateField'

type Extra = Record<string, string | number | null> | undefined

/** Các ô người dùng tự thêm cho vườn / khoản thu chi / vật tư */
export function CustomFieldInputs({ fields, target, texts, onChange }: { fields: CustomFieldDef[]; target: CustomFieldTarget; texts: Record<string, string>; onChange: (texts: Record<string, string>) => void }) {
  const list = fieldsFor(fields, target)
  if (list.length === 0) return null
  const set = (key: string, value: string) => onChange({ ...texts, [key]: value })
  return (
    <>
      {list.map((f) =>
        f.type === 'date' ? (
          <DateField key={f.id} label={f.label} value={texts[f.key] ?? ''} onChange={(v) => set(f.key, v)} optional />
        ) : f.type === 'select' ? (
          <fieldset key={f.id}>
            <legend>{f.label}</legend>
            <div className="segmented wrap">
              {(f.options ?? []).map((o) => (
                <button key={o} type="button" className={texts[f.key] === o ? 'active' : ''} aria-pressed={texts[f.key] === o} onClick={() => set(f.key, texts[f.key] === o ? '' : o)}>
                  {o}
                </button>
              ))}
            </div>
          </fieldset>
        ) : (
          <label key={f.id}>
            {f.label}
            <input
              value={texts[f.key] ?? ''}
              inputMode={f.type === 'number' ? 'decimal' : undefined}
              onChange={(e) => set(f.key, f.type === 'number' ? e.target.value.replace(/[^\d.,-]/g, '') : e.target.value)}
              maxLength={200}
            />
          </label>
        ),
      )}
    </>
  )
}

/** "Số gốc cây: 1.200 · Giống: TR9" */
export function FieldLines({ fields, target, extra, className = 'small muted' }: { fields: CustomFieldDef[]; target: CustomFieldTarget; extra: Extra; className?: string }) {
  const lines = fieldLines(fields, target, extra)
  if (lines.length === 0) return null
  return <p className={className}>{lines.map((l) => `${l.label}: ${l.value}`).join(' · ')}</p>
}
