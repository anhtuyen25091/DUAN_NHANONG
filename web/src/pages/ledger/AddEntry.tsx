import { fieldsFor, formatVnd, pressAmountKey, readVnd, today, type AmountKey, type EntryType, type Ledger, type LedgerSnapshot, type QuickTemplate } from '@nhanong/shared'
import { useEffect, useState } from 'react'
import { go, href } from '../../hooks'
import { showToast } from '../../ledger/toast'
import { DateField } from '../../components/DateField'
import { extraTexts, saveExtra } from '@nhanong/shared'
import { CustomFieldInputs } from './extraFields'
import { ReceiptPhoto } from '../../components/ReceiptPhoto'
import { VoiceButton } from '../../components/VoiceButton'

const KEYS: AmountKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'xóa']

/**
 * Ghi 1 khoản trong 3 bước: chọn hạng mục (icon) → nhập số tiền → Lưu.
 * ?sua=id: sửa khoản đã ghi; ?vuon=id: chọn sẵn vườn; ?ve=path: quay về đâu sau khi lưu.
 */
export function AddEntry({ ledger, data, query }: { ledger: Ledger; data: LedgerSnapshot; query: URLSearchParams }) {
  const editing = data.transactions.find((t) => t.id === query.get('sua'))
  const back = query.get('ve') ?? 'so'
  const defaultGarden = query.get('vuon') ?? data.meta.last_garden_id ?? data.gardens[0]?.id ?? null

  const [type, setType] = useState<EntryType>(editing?.type ?? 'expense')
  const [categoryId, setCategoryId] = useState<string | null>(editing?.category_id ?? null)
  const [amount, setAmount] = useState(editing?.amount ?? 0)
  const [gardenId, setGardenId] = useState<string | null>(editing ? editing.garden_id : data.gardens.some((g) => g.id === defaultGarden) ? defaultGarden : null)
  const [date, setDate] = useState(editing?.date ?? today())
  const [note, setNote] = useState(editing?.note ?? '')
  const [saving, setSaving] = useState(false)
  // Khi sửa: phím số đầu tiên thay số cũ (như máy tính bỏ túi), không gõ nối vào
  const [fresh, setFresh] = useState(!!editing)
  const [extra, setExtra] = useState(() => extraTexts(data.custom_fields, 'transaction', editing?.extra))
  const [keepAsTemplate, setKeepAsTemplate] = useState(false)
  const [photoId, setPhotoId] = useState<string | null>(editing?.photo_id ?? null)

  /** Bấm 1 khoản hay dùng: điền sẵn mọi thứ, nhảy thẳng sang bước số tiền (vẫn sửa được trước khi Lưu) */
  const applyTemplate = (t: QuickTemplate) => {
    setType(t.type)
    setCategoryId(data.categories.some((c) => c.id === t.category_id) ? t.category_id : null)
    setAmount(t.amount)
    setFresh(true)
    if (t.garden_id === null || data.gardens.some((g) => g.id === t.garden_id)) setGardenId(t.garden_id)
    setNote(t.note ?? '')
  }

  const category = data.categories.find((c) => c.id === categoryId)
  const press = (key: AmountKey) => {
    const replace = fresh && /^[0-9]$/.test(key)
    setFresh(false)
    setAmount((a) => pressAmountKey(replace ? 0 : a, key))
  }

  // Gõ bàn phím máy tính cũng được
  useEffect(() => {
    if (!category) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return
      if (/^[0-9]$/.test(e.key)) press(e.key as AmountKey)
      else if (e.key === 'Backspace') press('xóa')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, fresh])

  const save = async () => {
    if (!category || amount <= 0) return
    setSaving(true)
    const entry = { type, amount, category_id: category.id, garden_id: gardenId, date, note, photo_id: photoId }
    let id = editing?.id
    if (editing) await ledger.updateEntry(editing.id, entry)
    else id = (await ledger.addEntry(entry)).id
    await saveExtra(ledger, data.custom_fields, 'transaction', id!, extra)
    if (keepAsTemplate && !editing) await ledger.templateFromEntry(id!)
    showToast({ message: `Đã lưu ${type === 'income' ? 'tiền vào' : 'tiền ra'} ${formatVnd(amount)}${keepAsTemplate && !editing ? ' · đã thêm vào khoản hay dùng' : ''}` })
    go(back)
  }

  // Bước 1: chọn hạng mục
  if (!category) {
    return (
      <div className="ledger">
        <a className="back" href={href(back)}>
          ‹ Quay lại
        </a>
        <div className="type-switch" role="tablist">
          <button type="button" role="tab" aria-selected={type === 'expense'} className={type === 'expense' ? 'active out' : ''} onClick={() => setType('expense')}>
            Tiền ra
          </button>
          <button type="button" role="tab" aria-selected={type === 'income'} className={type === 'income' ? 'active in' : ''} onClick={() => setType('income')}>
            Tiền vào
          </button>
        </div>
        {!editing && data.templates.length > 0 && (
          <section className="templates" aria-label="Khoản hay dùng">
            <h2 className="small muted">⭐ Khoản hay dùng</h2>
            <div className="template-row">
              {data.templates.map((t) => (
                <button key={t.id} type="button" className={`template ${t.type === 'income' ? 'in' : 'out'}`} onClick={() => applyTemplate(t)}>
                  <span>{data.categories.find((c) => c.id === t.category_id)?.icon ?? '📦'} {t.label}</span>
                  <b>{formatVnd(t.amount)}</b>
                </button>
              ))}
            </div>
          </section>
        )}
        <h1>{type === 'expense' ? 'Chi cho việc gì?' : 'Tiền vào từ đâu?'}</h1>
        <div className="icon-grid">
          {data.categories
            .filter((c) => c.type === type)
            .map((c) => (
              <button key={c.id} type="button" className="icon-tile" onClick={() => setCategoryId(c.id)}>
                <span className="icon" aria-hidden>
                  {c.icon}
                </span>
                {c.name}
              </button>
            ))}
        </div>
      </div>
    )
  }

  // Bước 2: số tiền + vườn → Lưu
  return (
    <div className="ledger add-amount">
      <button type="button" className="linklike back" onClick={() => setCategoryId(null)}>
        ‹ Đổi hạng mục
      </button>
      <h1>
        {category.icon} {category.name}
      </h1>

      <div className={`amount-display ${type === 'income' ? 'in' : 'out'}`} aria-live="polite">
        <div className="amount-number">{formatVnd(amount)}</div>
        <div className="small muted">{amount > 0 ? readVnd(amount) : 'Bấm số bên dưới'}</div>
      </div>

      <div className="keypad">
        {KEYS.map((k) => (
          <button key={k} type="button" onClick={() => press(k)} aria-label={k === 'xóa' ? 'Xóa 1 số' : k}>
            {k === 'xóa' ? '⌫' : k}
          </button>
        ))}
        <button type="button" className="unit" onClick={() => press('nghìn')}>
          nghìn
        </button>
        <button type="button" className="unit" onClick={() => press('triệu')}>
          triệu
        </button>
        <button type="button" className="unit" onClick={() => press('C')}>
          Xóa hết
        </button>
      </div>

      {data.gardens.length > 0 && (
        <fieldset className="garden-pick">
          <legend className="small muted">Vườn</legend>
          <div className="segmented wrap">
            {data.gardens.map((g) => (
              <button key={g.id} type="button" className={g.id === gardenId ? 'active' : ''} aria-pressed={g.id === gardenId} onClick={() => setGardenId(g.id)}>
                {g.name}
              </button>
            ))}
            <button type="button" className={gardenId === null ? 'active' : ''} aria-pressed={gardenId === null} onClick={() => setGardenId(null)}>
              Chi chung
            </button>
          </div>
        </fieldset>
      )}

      <ReceiptPhoto photoId={photoId} onChange={setPhotoId} />

      <details className="more" open={fieldsFor(data.custom_fields, 'transaction').length > 0 && Object.values(extra).some(Boolean)}>
        <summary>
          Ngày ({date === today() ? 'hôm nay' : date.split('-').reverse().join('/')}) · ghi chú{fieldsFor(data.custom_fields, 'transaction').length > 0 ? ' · thông tin thêm' : ''}
        </summary>
        <DateField label="Ngày" value={date} onChange={setDate} max={today()} />
        <label>
          Ghi chú
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Ví dụ: 4 bao NPK" />
        </label>
        <VoiceButton onText={(text) => setNote((n) => (n ? `${n} ${text}` : text).slice(0, 200))} />
        <CustomFieldInputs fields={data.custom_fields} target="transaction" texts={extra} onChange={setExtra} />
      </details>

      {!editing && (
        <label className="checkbox keep-template">
          <input type="checkbox" checked={keepAsTemplate} onChange={(e) => setKeepAsTemplate(e.target.checked)} />
          ⭐ Lưu làm khoản hay dùng (lần sau bấm 1 lần là ghi)
        </label>
      )}

      <button type="button" className="wide primary save" disabled={amount <= 0 || saving} onClick={save}>
        {saving ? 'Đang lưu…' : 'Lưu'}
      </button>
    </div>
  )
}
