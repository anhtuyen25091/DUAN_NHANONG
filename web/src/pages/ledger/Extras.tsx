import {
  CUSTOM_FIELD_TARGET_LABELS,
  CUSTOM_FIELD_TYPE_LABELS,
  formatDate,
  formatDays,
  formatQty,
  formatQtyGrouped,
  formatVnd,
  formatWage,
  HARVEST_UNITS,
  today,
  workerBalances,
  workLogAmount,
  type CustomFieldTarget,
  type CustomFieldType,
  type Ledger,
  type LedgerSnapshot,
} from '@nhanong/shared'
import { useState, type FormEvent } from 'react'
import { DateField } from '../../components/DateField'
import { go, href } from '../../hooks'
import { parseQty, qtyText } from '../../ledger/qty'
import { showToast } from '../../ledger/toast'
import { GardenPicker, MoneyField, QtyField } from './fields'

const toastError = (err: unknown) => showToast({ message: (err as Error).message })

// ---------------------------------------------------------------- Thu hoạch

/** #/so/vuon/:id/thu-hoach-moi, #/so/thu-hoach/:hid */
export function HarvestForm({ ledger, data, gardenId, id }: { ledger: Ledger; data: LedgerSnapshot; gardenId?: string; id?: string }) {
  const harvest = data.harvests.find((h) => h.id === id)
  const [garden, setGarden] = useState<string | null>(harvest?.garden_id ?? gardenId ?? data.gardens[0]?.id ?? null)
  const crop0 = harvest?.crop ?? data.gardens.find((g) => g.id === garden)?.crop ?? ''
  const [crop, setCrop] = useState(crop0)
  const [qty, setQty] = useState(qtyText(harvest?.quantity ?? 0))
  const [unit, setUnit] = useState(harvest?.unit ?? 'kg')
  const [sold, setSold] = useState(!!harvest?.price)
  const [price, setPrice] = useState(harvest?.price ?? 0)
  const [date, setDate] = useState(harvest?.date ?? today())
  const [note, setNote] = useState(harvest?.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const quantity = parseQty(qty)
  const back = harvest ? `so/vuon/${harvest.garden_id}` : garden ? `so/vuon/${garden}` : 'so'

  if (id && !harvest) return <div className="notice">Không tìm thấy lần thu hoạch này (có thể đã xóa).</div>

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!garden) return setError('Hãy chọn vườn.')
    setError(null)
    const input = { garden_id: garden, date, crop, quantity, unit, price: sold ? price : null, note }
    try {
      if (harvest) await ledger.updateHarvest(harvest.id, input)
      else await ledger.addHarvest(input)
      showToast({ message: `Đã ghi ${formatQtyGrouped(quantity)} ${unit}${sold && price ? ` · tiền vào ${formatVnd(Math.round(quantity * price))}` : ''}` })
      go(`so/vuon/${garden}`)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const remove = async () => {
    if (!harvest) return
    const undo = await ledger.removeHarvest(harvest.id)
    showToast({ message: 'Đã xóa lần thu hoạch', undo })
    go(back)
  }

  return (
    <form className="form ledger" onSubmit={submit}>
      <a className="back" href={href(back)}>
        ‹ Quay lại
      </a>
      <h1>🌾 {harvest ? 'Sửa thu hoạch' : 'Ghi thu hoạch'}</h1>
      <GardenPicker data={data} value={garden} onChange={setGarden} />
      <div className="row-2">
        <QtyField label="Sản lượng *" text={qty} onText={setQty} />
        <fieldset>
          <legend>Đơn vị</legend>
          <div className="segmented wrap">
            {HARVEST_UNITS.map((u) => (
              <button key={u} type="button" className={u === unit ? 'active' : ''} aria-pressed={u === unit} onClick={() => setUnit(u)}>
                {u}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      <label>
        Loại nông sản
        <input value={crop} onChange={(e) => setCrop(e.target.value)} maxLength={60} placeholder="Ví dụ: Cà phê nhân, Sầu riêng Ri6" />
      </label>
      <DateField label="Ngày thu hoạch" value={date} onChange={setDate} max={today()} />
      <label className="checkbox">
        <input type="checkbox" checked={sold} onChange={(e) => setSold(e.target.checked)} />
        Đã bán, ghi luôn tiền vào
      </label>
      {sold && (
        <>
          <MoneyField label={`Giá bán 1 ${unit}`} value={Math.round(price)} onChange={setPrice} />
          {quantity > 0 && price > 0 && (
            <p className="small">
              Tiền vào: <b className="in">{formatVnd(Math.round(quantity * price))}</b> (ghi vào hạng mục “Bán nông sản” của vườn)
            </p>
          )}
        </>
      )}
      <p className="small muted">Bán cho lái theo đợt cắt thì không cần ghi ở đây: số kg đã cắt được tự cộng vào sản lượng.</p>
      <label>
        Ghi chú
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
      </label>
      {error && <div className="notice error">{error}</div>}
      <button type="submit" className="wide primary" disabled={!(quantity > 0) || (sold && !(price > 0))}>
        Lưu
      </button>
      {harvest && (
        <button type="button" className="wide danger-outline" onClick={remove}>
          Xóa lần thu hoạch này{harvest.price ? ' (kèm khoản tiền bán)' : ''}
        </button>
      )}
    </form>
  )
}

// ---------------------------------------------------------------- Khoản hay dùng

/** #/so/mau: danh sách khoản hay dùng, đổi tên / số tiền, xóa */
export function TemplateList({ ledger, data }: { ledger: Ledger; data: LedgerSnapshot }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState(0)

  const start = (id: string) => {
    const t = data.templates.find((x) => x.id === id)!
    setEditing(id)
    setLabel(t.label)
    setAmount(t.amount)
  }
  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!editing) return
    await ledger.updateTemplate(editing, { label, amount }).catch(toastError)
    setEditing(null)
  }
  const remove = async (id: string) => {
    const undo = await ledger.removeTemplate(id)
    showToast({ message: 'Đã xóa khoản hay dùng', undo })
  }
  const use = async (id: string) => {
    const t = data.templates.find((x) => x.id === id)!
    try {
      await ledger.useTemplate(id)
      showToast({ message: `Đã ghi ${t.label}: ${formatVnd(t.amount)}` })
    } catch (err) {
      toastError(err)
    }
  }

  return (
    <div className="ledger">
      <a className="back" href={href('so/cai-dat')}>
        ‹ Cài đặt sổ
      </a>
      <h1>⭐ Khoản hay dùng</h1>
      <p className="small muted">Khoản ghi đi ghi lại (xịt thuốc, tiền điện tưới…). Ở màn Ghi tiền bấm vào là điền sẵn, chỉ cần bấm Lưu. Thêm mới bằng cách tích “Lưu làm khoản hay dùng” khi ghi tiền.</p>
      {data.templates.length === 0 && <div className="notice">Chưa có khoản hay dùng nào.</div>}
      <div className="entries">
        {data.templates.map((t) =>
          editing === t.id ? (
            <form key={t.id} className="card form" onSubmit={save}>
              <label>
                Tên
                <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} required />
              </label>
              <MoneyField label="Số tiền" value={amount} onChange={setAmount} />
              <div className="actions">
                <button type="submit" className="primary" disabled={!(amount > 0)}>
                  Lưu
                </button>
                <button type="button" onClick={() => setEditing(null)}>
                  Thôi
                </button>
              </div>
            </form>
          ) : (
            <div key={t.id} className="card template-item">
              <div>
                <b>
                  {data.categories.find((c) => c.id === t.category_id)?.icon ?? '📦'} {t.label}
                </b>
                <p className="small muted">
                  {t.type === 'income' ? 'Tiền vào' : 'Tiền ra'} <span className={t.type === 'income' ? 'in' : 'out'}>{formatVnd(t.amount)}</span> ·{' '}
                  {t.garden_id ? (data.gardens.find((g) => g.id === t.garden_id)?.name ?? 'vườn đã xóa') : 'Chi chung'}
                </p>
              </div>
              <div className="actions">
                <button type="button" className="primary" onClick={() => use(t.id)}>
                  Ghi ngay
                </button>
                <button type="button" onClick={() => start(t.id)}>
                  Sửa
                </button>
                <button type="button" className="subtle-danger" onClick={() => remove(t.id)}>
                  Xóa
                </button>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Nhân công

/** #/so/cong: người làm, công còn nợ */
export function WorkerList({ data }: { data: LedgerSnapshot }) {
  const balances = workerBalances(data)
  const owed = balances.reduce((s, b) => s + b.owed, 0)
  return (
    <div className="ledger">
      <a className="back" href={href('so')}>
        ‹ Sổ thu chi
      </a>
      <div className="title-row">
        <h1>👷 Nhân công</h1>
        <a className="button subtle" href={href('so/cong/nguoi-moi')}>
          ＋ Thêm người
        </a>
      </div>
      <p className="small muted">Chấm công mỗi ngày làm. Khi trả tiền, sổ tự ghi khoản “Nhân công” vào đúng vườn đã làm.</p>
      <section className="card">
        <p className="small muted">Công chưa trả</p>
        <p className={`big ${owed ? 'out' : ''}`}>{formatVnd(owed)}</p>
      </section>
      {balances.length === 0 && <div className="notice">Chưa có ai. Bấm “＋ Thêm người” để thêm người làm thuê và tiền công 1 ngày.</div>}
      <div className="garden-list">
        {balances.map((b) => (
          <a key={b.worker.id} className="card garden-row" href={href(`so/cong/nguoi/${b.worker.id}`)}>
            <span className="garden-name">
              {b.worker.name}
              <span className="small muted">
                {' '}
                · {formatWage(b.worker.wage)}
                {b.lastWorked && ` · làm gần nhất ${formatDate(b.lastWorked)}`}
              </span>
            </span>
            <span className={`profit ${b.owed ? 'loss' : ''}`}>{b.owed ? `nợ ${formatVnd(b.owed)}` : 'đã trả đủ'}</span>
          </a>
        ))}
      </div>
      {balances.length > 0 && (
        <a className="fab" href={href('so/cong/cham')}>
          ✅ Chấm công
        </a>
      )}
    </div>
  )
}

/** #/so/cong/nguoi-moi, #/so/cong/nguoi/:id/sua */
export function WorkerForm({ ledger, data, id }: { ledger: Ledger; data: LedgerSnapshot; id?: string }) {
  const worker = data.workers.find((w) => w.id === id)
  const [name, setName] = useState(worker?.name ?? '')
  const [phone, setPhone] = useState(worker?.phone ?? '')
  const [wage, setWage] = useState(worker?.wage ?? 0)
  const [note, setNote] = useState(worker?.note ?? '')
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      if (worker) {
        await ledger.updateWorker(worker.id, { name, phone, wage, note })
        go(`so/cong/nguoi/${worker.id}`)
      } else {
        await ledger.addWorker({ name, phone, wage, note })
        go('so/cong')
      }
    } catch (err) {
      setError((err as Error).message)
    }
  }
  const remove = async () => {
    if (!worker) return
    try {
      const undo = await ledger.removeWorker(worker.id)
      showToast({ message: `Đã xóa ${worker.name}`, undo })
      go('so/cong')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <form className="form ledger" onSubmit={submit}>
      <a className="back" href={href(worker ? `so/cong/nguoi/${worker.id}` : 'so/cong')}>
        ‹ Quay lại
      </a>
      <h1>{worker ? 'Sửa người làm' : 'Thêm người làm'}</h1>
      <label>
        Tên *
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} placeholder="Ví dụ: Anh Ba, Chị Tư" autoFocus={!worker} />
      </label>
      <MoneyField label="Tiền công 1 ngày *" value={wage} onChange={setWage} />
      {worker && wage !== worker.wage && <p className="small muted">Giá mới chỉ tính cho ngày công chấm từ nay; công đã chấm giữ giá cũ.</p>}
      <label>
        Số điện thoại
        <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} />
      </label>
      <label>
        Ghi chú
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
      </label>
      {error && <div className="notice error">{error}</div>}
      <button type="submit" className="wide primary" disabled={!name.trim() || !(wage > 0)}>
        Lưu
      </button>
      {worker && (
        <button type="button" className="wide danger-outline" onClick={remove}>
          Xóa người này
        </button>
      )}
    </form>
  )
}

/** #/so/cong/nguoi/:id: các ngày công, trả công */
export function WorkerDetail({ ledger, data, id }: { ledger: Ledger; data: LedgerSnapshot; id: string }) {
  const balance = workerBalances(data).find((b) => b.worker.id === id)
  const [payDate, setPayDate] = useState(today())
  if (!balance) return <div className="notice">Không tìm thấy người này (có thể đã xóa).</div>
  const { worker } = balance
  const logs = data.work_logs.filter((l) => l.worker_id === id)
  const gardenName = (gid: string | null) => (gid ? (data.gardens.find((g) => g.id === gid)?.name ?? 'vườn đã xóa') : 'Chi chung')

  const pay = async () => {
    try {
      const undo = await ledger.payWorker(worker.id, { date: payDate })
      showToast({ message: `Đã trả công ${worker.name}: ${formatVnd(balance.owed)}`, undo })
    } catch (err) {
      toastError(err)
    }
  }
  const unpay = async (transactionId: string) => {
    const undo = await ledger.unpayWork(transactionId)
    showToast({ message: 'Đã bỏ lần trả công này', undo })
  }
  const removeLog = async (logId: string) => {
    try {
      const undo = await ledger.removeWorkLog(logId)
      showToast({ message: 'Đã xóa ngày công', undo })
    } catch (err) {
      toastError(err)
    }
  }

  return (
    <div className="ledger">
      <a className="back" href={href('so/cong')}>
        ‹ Nhân công
      </a>
      <div className="title-row">
        <h1>{worker.name}</h1>
        <a className="button subtle" href={href(`so/cong/nguoi/${worker.id}/sua`)}>
          Sửa
        </a>
      </div>
      <p className="muted">
        {formatWage(worker.wage)}
        {worker.phone && (
          <>
            {' · '}
            <a href={`tel:${worker.phone.replace(/[^\d+]/g, '')}`}>📞 {worker.phone}</a>
          </>
        )}
      </p>

      <section className="card">
        <p className="small muted">Chưa trả</p>
        <p className={`big ${balance.owed ? 'out' : ''}`}>{formatVnd(balance.owed)}</p>
        <p className="small muted">
          {formatDays(balance.unpaidDays)} công · đã trả từ trước tới nay {formatVnd(balance.paid)}
        </p>
        {balance.owed > 0 && (
          <>
            <DateField label="Ngày trả" value={payDate} onChange={setPayDate} max={today()} />
            <button type="button" className="wide primary" onClick={pay}>
              💵 Trả công {formatVnd(balance.owed)}
            </button>
          </>
        )}
      </section>

      <a className="button" href={href('so/cong/cham', { nguoi: worker.id })}>
        ✅ Chấm công cho {worker.name}
      </a>

      <h2 className="section">Các ngày công</h2>
      {logs.length === 0 && <p className="muted">Chưa chấm công ngày nào.</p>}
      <div className="entries">
        {logs.map((l) => (
          <div key={l.id} className="entry">
            <span className="entry-main">
              <span className="entry-icon" aria-hidden>
                {l.paid_on ? '✅' : '🕒'}
              </span>
              <span className="entry-text">
                <span>
                  {formatDate(l.date)} · {formatDays(l.days)}
                </span>
                <span className="small muted">
                  {gardenName(l.garden_id)}
                  {l.paid_on ? ` · đã trả ${formatDate(l.paid_on)}` : ' · chưa trả'}
                  {l.note ? ` · ${l.note}` : ''}
                </span>
              </span>
              <span className="amount out">{formatVnd(workLogAmount(l))}</span>
            </span>
            {l.paid_on && l.transaction_id ? (
              <button type="button" className="entry-del" title="Bỏ lần trả công này" aria-label="Bỏ lần trả công này" onClick={() => unpay(l.transaction_id!)}>
                ↩
              </button>
            ) : (
              <button type="button" className="entry-del" aria-label="Xóa ngày công này" onClick={() => removeLog(l.id)}>
                🗑
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/** #/so/cong/cham: chấm công 1 ngày cho nhiều người (?nguoi=id: chọn sẵn 1 người) */
export function WorkDayForm({ ledger, data, query }: { ledger: Ledger; data: LedgerSnapshot; query: URLSearchParams }) {
  const only = query.get('nguoi')
  const [date, setDate] = useState(today())
  const [garden, setGarden] = useState<string | null>(data.gardens.some((g) => g.id === data.meta.last_garden_id) ? data.meta.last_garden_id! : (data.gardens[0]?.id ?? null))
  const [days, setDays] = useState<Record<string, number>>(() => (only ? { [only]: 1 } : {}))
  const [custom, setCustom] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const chosen = Object.entries(days).filter(([, d]) => d > 0)
  const total = chosen.reduce((s, [wid, d]) => s + Math.round(d * (data.workers.find((w) => w.id === wid)?.wage ?? 0)), 0)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await ledger.addWorkDay({ date, garden_id: garden, workers: chosen.map(([worker_id, d]) => ({ worker_id, days: d })), note })
      showToast({ message: `Đã chấm công ${chosen.length} người · ${formatVnd(total)} (chưa trả)` })
      go(only ? `so/cong/nguoi/${only}` : 'so/cong')
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <form className="form ledger" onSubmit={submit}>
      <a className="back" href={href(only ? `so/cong/nguoi/${only}` : 'so/cong')}>
        ‹ Quay lại
      </a>
      <h1>✅ Chấm công</h1>
      <DateField label="Ngày làm" value={date} onChange={setDate} max={today()} />
      <GardenPicker data={data} value={garden} onChange={setGarden} allowShared legend="Làm ở vườn" />
      <fieldset>
        <legend>Ai đi làm?</legend>
        {data.workers.map((w) => {
          const d = days[w.id] ?? 0
          const set = (v: number) => setDays({ ...days, [w.id]: v })
          return (
            <div key={w.id} className="work-row">
              <span>
                <b>{w.name}</b> <span className="small muted">{formatWage(w.wage)}</span>
              </span>
              <div className="segmented wrap">
                {[
                  [0, 'Nghỉ'],
                  [0.5, 'Nửa ngày'],
                  [1, 'Cả ngày'],
                ].map(([v, text]) => (
                  <button
                    key={text}
                    type="button"
                    className={d === v ? 'active' : ''}
                    aria-pressed={d === v}
                    onClick={() => {
                      setCustom({ ...custom, [w.id]: '' })
                      set(v as number)
                    }}
                  >
                    {text}
                  </button>
                ))}
                <input
                  className="days-input"
                  aria-label={`Số ngày công khác của ${w.name}`}
                  inputMode="decimal"
                  placeholder="Khác"
                  value={custom[w.id] ?? (d !== 0 && d !== 0.5 && d !== 1 ? formatQty(d) : '')}
                  onChange={(e) => {
                    setCustom({ ...custom, [w.id]: e.target.value })
                    set(parseQty(e.target.value))
                  }}
                />
              </div>
            </div>
          )
        })}
      </fieldset>
      <label>
        Ghi chú
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Ví dụ: làm cỏ, bón phân" />
      </label>
      {error && <div className="notice error">{error}</div>}
      <button type="submit" className="wide primary save" disabled={chosen.length === 0}>
        Lưu · {chosen.length} người · {formatVnd(total)}
      </button>
    </form>
  )
}

// ---------------------------------------------------------------- Ô tự thêm

const TARGETS = Object.keys(CUSTOM_FIELD_TARGET_LABELS) as CustomFieldTarget[]
const TYPES = Object.keys(CUSTOM_FIELD_TYPE_LABELS) as CustomFieldType[]

/** #/so/o-tu-them: thêm ô thông tin riêng cho vườn / khoản thu chi / vật tư */
export function CustomFieldSettings({ ledger, data }: { ledger: Ledger; data: LedgerSnapshot }) {
  const [target, setTarget] = useState<CustomFieldTarget>('garden')
  const [label, setLabel] = useState('')
  const [type, setType] = useState<CustomFieldType>('text')
  const [options, setOptions] = useState('')
  const [error, setError] = useState<string | null>(null)

  const add = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await ledger.addCustomField({ target, label, type, options: options.split(/[,\n]/) })
      showToast({ message: `Đã thêm ô “${label.trim()}” cho ${CUSTOM_FIELD_TARGET_LABELS[target].toLowerCase()}` })
      setLabel('')
      setOptions('')
    } catch (err) {
      setError((err as Error).message)
    }
  }
  const rename = async (id: string, current: string) => {
    const next = window.prompt('Tên mới của ô', current)
    if (next && next.trim() !== current) await ledger.updateCustomField(id, { label: next }).catch(toastError)
  }
  const remove = async (id: string, name: string) => {
    const undo = await ledger.removeCustomField(id)
    showToast({ message: `Đã xóa ô “${name}” (giá trị đã nhập vẫn giữ, hoàn tác là hiện lại)`, undo })
  }

  return (
    <div className="ledger">
      <a className="back" href={href('so/cai-dat')}>
        ‹ Cài đặt sổ
      </a>
      <h1>🏷️ Thông tin tự thêm</h1>
      <p className="small muted">Thêm ô riêng để ghi những gì sổ chưa có, ví dụ vườn: “Số gốc cây”, “Giống”; khoản thu chi: “Người mua”.</p>

      {TARGETS.map((t) => {
        const list = data.custom_fields.filter((f) => f.target === t)
        return (
          <section key={t} className="card">
            <h2>{CUSTOM_FIELD_TARGET_LABELS[t]}</h2>
            {list.length === 0 && <p className="small muted">Chưa có ô nào.</p>}
            {list.map((f) => (
              <div key={f.id} className="field-def">
                <span>
                  <b>{f.label}</b>{' '}
                  <span className="small muted">
                    · {CUSTOM_FIELD_TYPE_LABELS[f.type]}
                    {f.options ? `: ${f.options.join(', ')}` : ''}
                  </span>
                </span>
                <span className="actions">
                  <button type="button" onClick={() => rename(f.id, f.label)}>
                    Đổi tên
                  </button>
                  <button type="button" className="subtle-danger" onClick={() => remove(f.id, f.label)}>
                    Xóa
                  </button>
                </span>
              </div>
            ))}
          </section>
        )
      })}

      <form className="card form" onSubmit={add}>
        <h2>＋ Thêm ô mới</h2>
        <fieldset>
          <legend>Cho</legend>
          <div className="segmented wrap">
            {TARGETS.map((t) => (
              <button key={t} type="button" className={t === target ? 'active' : ''} aria-pressed={t === target} onClick={() => setTarget(t)}>
                {CUSTOM_FIELD_TARGET_LABELS[t]}
              </button>
            ))}
          </div>
        </fieldset>
        <label>
          Tên ô *
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} required placeholder="Ví dụ: Số gốc cây" />
        </label>
        <fieldset>
          <legend>Loại</legend>
          <div className="segmented wrap">
            {TYPES.map((t) => (
              <button key={t} type="button" className={t === type ? 'active' : ''} aria-pressed={t === type} onClick={() => setType(t)}>
                {CUSTOM_FIELD_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </fieldset>
        {type === 'select' && (
          <label>
            Các lựa chọn (cách nhau bằng dấu phẩy)
            <input value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Ví dụ: TR4, TR9, Xanh lùn" />
          </label>
        )}
        {error && <div className="notice error">{error}</div>}
        <button type="submit" className="wide primary" disabled={!label.trim()}>
          Thêm ô
        </button>
      </form>
    </div>
  )
}
