import {
  FARM_LOG_KIND_LABELS,
  FARM_LOG_KINDS,
  farmLogLine,
  farmLogText,
  formatDate,
  formatQty,
  supplyStock,
  today,
  WITHHOLDING_PRESETS,
  withholdingOn,
  withholdingText,
  type FarmLogKind,
  type Ledger,
  type LedgerSnapshot,
} from '@nhanong/shared'
import { useState, type FormEvent } from 'react'
import { DateField } from '../../components/DateField'
import { go, href } from '../../hooks'
import { parseQty, qtyText } from '../../ledger/qty'
import { showToast } from '../../ledger/toast'
import { GardenPicker, QtyField } from './fields'

/** Cảnh báo vườn đang trong thời gian cách ly thuốc (vào ngày `on`) */
export function WithholdingNotice({ data, gardenId, on = today() }: { data: LedgerSnapshot; gardenId: string | null; on?: string }) {
  const w = gardenId ? withholdingOn(data.farm_logs, gardenId, on) : null
  return w ? <div className="notice error">⚠️ {withholdingText(w)}</div> : null
}

/** Trang vườn: 5 việc gần nhất, lối vào ghi việc / xem cả nhật ký */
export function FarmLogSection({ data, gardenId }: { data: LedgerSnapshot; gardenId: string }) {
  const logs = data.farm_logs.filter((l) => l.garden_id === gardenId)
  return (
    <>
      <h2 className="section">📓 Nhật ký canh tác</h2>
      {logs.length === 0 ? (
        <p className="small muted">Ghi lại các lần phun thuốc, bón phân, tưới… Có thời gian cách ly thì app nhắc ngày được thu hoạch. In / gửi nhật ký khi làm hồ sơ truy xuất nguồn gốc, mã vùng trồng.</p>
      ) : (
        <div className="entries">
          {logs.slice(0, 5).map((l) => (
            <a key={l.id} className="entry entry-main" href={href(`so/nhat-ky/${l.id}`)}>
              <span className="entry-text">
                <span>
                  {FARM_LOG_KIND_LABELS[l.kind]}: {l.title}
                </span>
                <span className="small muted">
                  {formatDate(l.date)}
                  {l.quantity ? ` · ${formatQty(l.quantity)}${l.unit ? ` ${l.unit}` : ''}` : ''}
                  {l.target ? ` · trị ${l.target}` : ''}
                  {l.withholding_days ? ` · cách ly ${l.withholding_days} ngày` : ''}
                </span>
              </span>
            </a>
          ))}
        </div>
      )}
      <div className="btn-row">
        <a className="button" href={href(`so/vuon/${gardenId}/nhat-ky-moi`)}>
          ＋ Ghi việc
        </a>
        {logs.length > 0 && (
          <a className="button" href={href(`so/vuon/${gardenId}/nhat-ky`)}>
            Xem cả nhật ký ({logs.length}) · in / gửi
          </a>
        )}
      </div>
    </>
  )
}

/** #/so/vuon/:id/nhat-ky: cả nhật ký 1 vườn theo khoảng ngày, chép / gửi / in */
export function FarmLogBook({ data, gardenId }: { data: LedgerSnapshot; gardenId: string }) {
  const garden = data.gardens.find((g) => g.id === gardenId)
  const [from, setFrom] = useState(`${today().slice(0, 4)}-01-01`)
  const [to, setTo] = useState(today())
  if (!garden) return <div className="notice">Không tìm thấy vườn này.</div>
  const logs = data.farm_logs.filter((l) => l.garden_id === gardenId && l.date >= from && l.date <= to).sort((a, b) => a.date.localeCompare(b.date))
  const text = farmLogText(garden, data.farm_logs.filter((l) => l.garden_id === gardenId), { from, to })

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: `Nhật ký canh tác ${garden.name}`, text })
      else {
        await navigator.clipboard.writeText(text)
        showToast({ message: 'Đã chép nhật ký, dán vào Zalo / tin nhắn để gửi.' })
      }
    } catch {
      // Người dùng hủy chia sẻ
    }
  }

  return (
    <div className="ledger">
      <a className="back no-print" href={href(`so/vuon/${gardenId}`)}>
        ‹ {garden.name}
      </a>
      <h1>📓 Nhật ký canh tác: {garden.name}</h1>
      <p className="muted">
        {garden.crop ? `Cây trồng: ${garden.crop}` : ''}
        {garden.area_m2 ? ` · ${formatQty(garden.area_m2)} m²` : ''}
      </p>
      <section className="card form no-print">
        <div className="range-fields">
          <DateField label="Từ ngày" value={from} onChange={setFrom} max={to} />
          <DateField label="Đến ngày" value={to} onChange={setTo} min={from} max={today()} />
        </div>
        <div className="btn-row">
          <button type="button" className="primary" onClick={share}>
            📤 Gửi / chép nhật ký
          </button>
          <button type="button" onClick={() => window.print()}>
            🖨 In
          </button>
          <a className="button" href={href(`so/vuon/${gardenId}/nhat-ky-moi`)}>
            ＋ Ghi việc
          </a>
        </div>
      </section>
      <WithholdingNotice data={data} gardenId={gardenId} />
      {logs.length === 0 && <p className="muted">Chưa ghi việc nào trong khoảng ngày này.</p>}
      <ol className="farm-log-book">
        {logs.map((l) => (
          <li key={l.id}>
            <a href={href(`so/nhat-ky/${l.id}`)}>{farmLogLine(l)}</a>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** #/so/vuon/:id/nhat-ky-moi, #/so/nhat-ky/:lid */
export function FarmLogForm({ ledger, data, gardenId, id }: { ledger: Ledger; data: LedgerSnapshot; gardenId?: string; id?: string }) {
  const log = data.farm_logs.find((l) => l.id === id)
  const [garden, setGarden] = useState<string | null>(log?.garden_id ?? gardenId ?? data.meta.last_garden_id ?? data.gardens[0]?.id ?? null)
  const [kind, setKind] = useState<FarmLogKind>(log?.kind ?? 'spray')
  const [date, setDate] = useState(log?.date ?? today())
  const [supplyId, setSupplyId] = useState(log?.supply_id ?? '')
  const [title, setTitle] = useState(log?.title ?? '')
  const [qty, setQty] = useState(qtyText(log?.quantity ?? 0))
  const [unit, setUnit] = useState(log?.unit ?? '')
  const [target, setTarget] = useState(log?.target ?? '')
  const [days, setDays] = useState(log?.withholding_days ? String(log.withholding_days) : '')
  const [worker, setWorker] = useState(log?.worker ?? '')
  const [note, setNote] = useState(log?.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const back = garden ? `so/vuon/${garden}` : 'so'
  // Vật tư còn trong kho (Nâng cao): chọn thì tự ghi "dùng cho vườn"
  const stock = data.meta.advanced ? supplyStock(data).filter((s) => s.left > 1e-9 || s.supply.id === log?.supply_id) : []
  const chosen = stock.find((s) => s.supply.id === supplyId)

  if (id && !log) return <div className="notice">Không tìm thấy việc này (có thể đã xóa).</div>

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!garden) return setError('Hãy chọn vườn.')
    setError(null)
    const input = {
      garden_id: garden,
      date,
      kind,
      title,
      quantity: parseQty(qty) || null,
      unit,
      target,
      withholding_days: Number(days) || null,
      supply_id: log ? undefined : supplyId || null,
      worker,
      note,
    }
    try {
      if (log) await ledger.updateFarmLog(log.id, input)
      else await ledger.addFarmLog(input)
      showToast({ message: log ? 'Đã lưu' : `Đã ghi vào nhật ký${chosen && parseQty(qty) ? ` · trừ kho ${qty} ${chosen.supply.unit}` : ''}` })
      go(`so/vuon/${garden}`)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const remove = async () => {
    if (!log) return
    const undo = await ledger.removeFarmLog(log.id)
    showToast({ message: log.supply_usage_id ? 'Đã xóa, vật tư đã trả về kho' : 'Đã xóa', undo })
    go(back)
  }

  return (
    <form className="form ledger" onSubmit={submit}>
      <a className="back" href={href(back)}>
        ‹ Quay lại
      </a>
      <h1>📓 {log ? 'Sửa việc' : 'Ghi việc vào nhật ký'}</h1>
      <GardenPicker data={data} value={garden} onChange={setGarden} />
      <fieldset>
        <legend>Việc</legend>
        <div className="segmented wrap">
          {FARM_LOG_KINDS.map((k) => (
            <button key={k} type="button" className={k === kind ? 'active' : ''} aria-pressed={k === kind} onClick={() => setKind(k)}>
              {FARM_LOG_KIND_LABELS[k]}
            </button>
          ))}
        </div>
      </fieldset>
      <DateField label="Ngày làm" value={date} onChange={setDate} max={today()} />
      {!log && stock.length > 0 && (kind === 'spray' || kind === 'fertilize') && (
        <label>
          Lấy từ kho vật tư
          <select
            value={supplyId}
            onChange={(e) => {
              const s = stock.find((x) => x.supply.id === e.target.value)
              setSupplyId(e.target.value)
              if (s) {
                setTitle(s.supply.name)
                setUnit(s.supply.unit)
              }
            }}
          >
            <option value="">Không (chỉ ghi nhật ký)</option>
            {stock.map((s) => (
              <option key={s.supply.id} value={s.supply.id}>
                {s.supply.name} · còn {formatQty(s.left)} {s.supply.unit}
              </option>
            ))}
          </select>
          {chosen && <span className="small muted">Số lượng dùng sẽ trừ vào kho, tiền chuyển sang vườn.</span>}
        </label>
      )}
      <label>
        {kind === 'spray' ? 'Tên thuốc *' : kind === 'fertilize' ? 'Tên phân *' : 'Việc làm *'}
        <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} placeholder={kind === 'spray' ? 'Ví dụ: Regent 800WG' : kind === 'fertilize' ? 'Ví dụ: NPK 20-20-15' : 'Ví dụ: Tưới gốc 2 giờ'} />
      </label>
      <div className="row-2">
        <QtyField label="Liều lượng" text={qty} onText={setQty} />
        <label>
          Đơn vị
          <input value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={20} placeholder="chai, gói, kg" disabled={!!chosen} />
        </label>
      </div>
      {kind === 'spray' && (
        <>
          <label>
            Trị sâu bệnh gì
            <input value={target} onChange={(e) => setTarget(e.target.value)} maxLength={120} placeholder="Ví dụ: sâu đục thân, nấm hồng" />
          </label>
          <label>
            Thời gian cách ly (ngày, ghi trên nhãn thuốc)
            <input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="Ví dụ: 14" />
          </label>
          <div className="btn-row">
            {WITHHOLDING_PRESETS.map((d) => (
              <button key={d} type="button" className={`choice${days === String(d) ? ' active' : ''}`} aria-pressed={days === String(d)} onClick={() => setDays(String(d))}>
                {d} ngày
              </button>
            ))}
          </div>
        </>
      )}
      <label>
        Người làm
        <input value={worker} onChange={(e) => setWorker(e.target.value)} maxLength={60} placeholder="Ví dụ: Anh Tư" list="farm-log-workers" />
        <datalist id="farm-log-workers">
          {data.workers.map((w) => (
            <option key={w.id} value={w.name} />
          ))}
        </datalist>
      </label>
      <label>
        Ghi chú
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Ví dụ: pha 2 chai / phuy 200 lít" />
      </label>
      {error && <div className="notice error">{error}</div>}
      <button type="submit" className="wide primary" disabled={!title.trim()}>
        Lưu
      </button>
      {log && (
        <button type="button" className="wide danger-outline" onClick={remove}>
          Xóa việc này{log.supply_usage_id ? ' (vật tư trả về kho)' : ''}
        </button>
      )}
    </form>
  )
}
