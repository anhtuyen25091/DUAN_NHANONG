import {
  ApiError,
  canControl,
  canManage,
  FARM_LOG_KIND_LABELS,
  formatDate,
  formatQty,
  RAIN_FREE_PRESETS,
  REENTRY_PRESETS,
  today,
  WITHHOLDING_PRESETS,
  workStatusLines,
  type IotPlot,
  type IotPlotEvent,
  type IotPlotEventInput,
  type IotRole,
  type IotWorkKind,
  type IotWorkAdvice,
  type IotWorkStatus,
} from '@nhanong/shared'
import { useEffect, useState, type FormEvent } from 'react'
import { DateField } from '../../components/DateField'
import { Status } from '../../components/Status'
import { shortTime, syncFarmWork, useFarmWorkVersion, vnIso } from '../../farmwork'
import { go, href, useAsync, type AsyncState } from '../../hooks'
import { iotApi, useIotAuth } from '../../iot'

/**
 * Việc làm vườn trên lô (phun thuốc, bón phân, tưới…): dòng cảnh báo (cấm vào lô, cách ly, tạm dừng tưới trên tán),
 * danh sách việc trên trang lô, form ghi / lên kế hoạch (#/cam-bien/viec/moi?plot=&kind=, #/cam-bien/viec/{id}?plot=).
 * Lô nối với vườn trong Sổ thu chi thì nhật ký 2 bên tự đồng bộ (../../farmwork.ts).
 */

const ADD_BUTTONS: { kind: IotWorkKind; label: string }[] = [
  { kind: 'spray', label: '🧴 Phun thuốc' },
  { kind: 'fertilize', label: '🌱 Bón phân' },
  { kind: 'water', label: '💧 Tưới' },
  { kind: 'other', label: '📝 Việc khác' },
]

const pad = (n: number) => String(n).padStart(2, '0')

/** Cảnh báo đầu trang lô */
export function WorkBanners({ work }: { work: IotWorkStatus | undefined }) {
  const lines = workStatusLines(work)
  return (
    <>
      {lines.map((line) => (
        <p key={line.text} className={line.level === 'danger' ? 'notice error' : line.level === 'warn' ? 'notice warn' : 'notice small'}>
          {line.text}
        </p>
      ))}
    </>
  )
}

/** Nhãn gọn trong danh sách trang trại (chỉ cảnh báo đỏ / vàng) */
export function WorkBadges({ plot }: { plot: IotPlot }) {
  const lines = workStatusLines(plot.work).filter((l) => l.level !== 'info')
  if (lines.length === 0) return null
  return (
    <span className="work-badges">
      {lines.map((line) => (
        <span key={line.text} className={`work-badge ${line.level}`}>
          {line.text}
        </span>
      ))}
    </span>
  )
}

function eventInput(event: IotPlotEvent): IotPlotEventInput {
  return {
    kind: event.kind,
    title: event.title,
    quantity: event.quantity,
    unit: event.unit,
    target: event.target,
    withholding_days: event.withholding_days,
    reentry_hours: event.reentry_hours,
    rain_free_hours: event.rain_free_hours,
    worker: event.worker,
    note: event.note,
  }
}

function errorText(err: unknown): string {
  return err instanceof ApiError ? (Object.values(err.errors)[0]?.[0] ?? err.message) : (err as Error).message
}

/** Mục "Việc làm vườn" trên trang lô */
export function PlotWork({ plot, role, onChanged }: { plot: IotPlot; role: IotRole; onChanged: () => void }) {
  const me = useIotAuth()?.user.id
  const version = useFarmWorkVersion()
  const [events, reload] = useAsync(() => iotApi.plotEvents(plot.id), [plot.id, version])
  const [actuators] = useAsync(() => (canManage(role) ? iotApi.actuators(plot.id) : Promise.resolve([])), [plot.id, role])
  const [showAll, setShowAll] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<number | null>(null)

  const act = async (event: IotPlotEvent, run: () => Promise<unknown>) => {
    setBusy(event.id)
    setError(null)
    try {
      await run()
      reload()
      onChanged()
      void syncFarmWork(true)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(null)
    }
  }

  const undeclared = actuators.status === 'ok' ? actuators.data.filter((a) => (a.kind === 'pump' || a.kind === 'valve') && a.irrigation_mode === null) : []
  const list = events.status === 'ok' ? events.data : []
  const visible = showAll ? list : list.slice(0, 8)

  return (
    <>
      <h2 className="section-title">🧑‍🌾 Việc làm vườn</h2>
      {plot.ledger_garden_id ? (
        <p className="small muted">📒 Nhật ký dùng chung với vườn “{plot.ledger_garden_name ?? 'trong sổ'}” trong Sổ thu chi</p>
      ) : (
        canManage(role) && (
          <p className="small muted">
            📒 Muốn nhật ký phun thuốc, bón phân dùng chung với Sổ thu chi: bấm <a href={href(`cam-bien/sua-lo/${plot.id}`)}>✏️ Sửa lô</a> rồi chọn vườn.
          </p>
        )
      )}
      {undeclared.length > 0 && (
        <p className="notice small">
          💡 Khai báo kiểu tưới (gốc / trên tán) cho{' '}
          {undeclared.map((a, i) => (
            <span key={a.id}>
              {i > 0 ? ', ' : ''}
              <a href={href(`cam-bien/may/${a.id}`, { plot: String(plot.id) })}>{a.name}</a>
            </span>
          ))}{' '}
          để app tự dừng tưới trên tán sau khi phun thuốc.
        </p>
      )}
      {canControl(role) && (
        <div className="btn-row">
          {ADD_BUTTONS.map((b) => (
            <a key={b.kind} className="button" href={href('cam-bien/viec/moi', { plot: String(plot.id), kind: b.kind })}>
              {b.label}
            </a>
          ))}
        </div>
      )}
      <Status state={events} retry={reload} />
      {events.status === 'ok' && list.length === 0 && <p className="muted small">Chưa ghi việc nào trong 60 ngày qua.</p>}
      {error && <p className="field-error">{error}</p>}
      {visible.map((event) => {
        const canDelete = role === 'owner' || (canControl(role) && event.user?.id === me && event.source !== 'actuator')
        return (
          <div key={event.id} className="card work-event" style={event.planned ? { borderLeft: '6px solid #2b7bb9' } : event.kind === 'water' ? { opacity: 0.85 } : undefined}>
            <b>
              {event.kind_label}: {event.title}
            </b>
            {event.quantity ? (
              <span>
                {' '}
                · {formatQty(event.quantity)}
                {event.unit ? ` ${event.unit}` : ''}
              </span>
            ) : null}
            <br />
            <span className="small muted">
              {event.planned ? `📅 Kế hoạch ${shortTime(event.done_at)}` : shortTime(event.done_at)}
              {' · '}
              {event.source === 'actuator' ? 'Máy bơm tự ghi' : (event.worker ?? event.user?.name ?? 'Sổ thu chi')}
              {event.target ? ` · trị ${event.target}` : ''}
              {event.withholding_days ? ` · cách ly ${event.withholding_days} ngày` : ''}
              {event.reentry_hours ? ` · cấm vào ${event.reentry_hours} giờ` : ''}
              {event.note ? ` · ${event.note}` : ''}
            </span>
            {canControl(role) && (
              <div className="btn-row">
                {event.planned && (
                  <button type="button" className="primary" disabled={busy === event.id} onClick={() => act(event, () => iotApi.updatePlotEvent(event.id, { ...eventInput(event), planned: false }))}>
                    ✓ Đã làm
                  </button>
                )}
                {event.source !== 'actuator' && (
                  <a className="button" href={href(`cam-bien/viec/${event.id}`, { plot: String(plot.id) })}>
                    Sửa
                  </a>
                )}
                {canDelete && (
                  <button
                    type="button"
                    disabled={busy === event.id}
                    onClick={() => {
                      if (window.confirm(`Xóa "${event.title}"?${plot.ledger_garden_id && !event.planned ? ' Nhật ký trong Sổ thu chi cũng xóa theo.' : ''}`)) {
                        void act(event, () => iotApi.deletePlotEvent(event.id))
                      }
                    }}
                  >
                    Xóa
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
      {list.length > visible.length && (
        <button type="button" className="linklike" onClick={() => setShowAll(true)}>
          Xem thêm {list.length - visible.length} việc
        </button>
      )}
    </>
  )
}

const TITLE_LABELS: Record<IotWorkKind, { label: string; placeholder: string }> = {
  spray: { label: 'Tên thuốc *', placeholder: 'Tên thuốc, VD Regent 800WG' },
  fertilize: { label: 'Tên phân *', placeholder: 'Tên phân, VD NPK 20-20-15' },
  water: { label: 'Việc làm *', placeholder: 'VD Tưới gốc 2 giờ' },
  prune: { label: 'Việc làm *', placeholder: 'VD Tỉa cành, làm cỏ gốc' },
  other: { label: 'Việc làm *', placeholder: 'VD Bao trái, quét vôi gốc' },
}

type When = 'now' | 'past' | 'plan'

function Chips({ value, presets, unit, onPick }: { value: string; presets: number[]; unit: string; onPick: (v: string) => void }) {
  return (
    <div className="btn-row">
      {presets.map((d) => (
        <button key={d} type="button" className={`choice${value === String(d) ? ' active' : ''}`} aria-pressed={value === String(d)} onClick={() => onPick(value === String(d) ? '' : String(d))}>
          {d} {unit}
        </button>
      ))}
    </div>
  )
}

const digits = (v: string, max = 3) => v.replace(/\D/g, '').slice(0, max)

/** #/cam-bien/viec/moi?plot=&kind= và #/cam-bien/viec/{id}?plot= */
export function WorkEventForm({ id, plotId, kind }: { id: number | null; plotId: number; kind: IotWorkKind }) {
  const [data, reload] = useAsync(() => Promise.all([iotApi.plotSummary(plotId), id ? iotApi.plotEvents(plotId) : Promise.resolve([])]), [plotId, id])
  if (data.status !== 'ok') return <Status state={data} retry={reload} />
  const [summary, events] = data.data
  const event = id ? events.find((e) => e.id === id) : undefined
  if (id && !event) return <p className="notice">Không tìm thấy việc này (có thể đã xóa).</p>
  if (!canControl(summary.role)) return <p className="notice">Bạn chỉ được xem trang trại này, không ghi việc được.</p>
  return <WorkEventFormInner plot={summary.plot} event={event} initialKind={kind} />
}

function WorkEventFormInner({ plot, event, initialKind }: { plot: IotPlot; event?: IotPlotEvent; initialKind: IotWorkKind }) {
  const [kind, setKind] = useState<IotWorkKind>(event?.kind ?? initialKind)
  const [title, setTitle] = useState(event?.title ?? '')
  const [qty, setQty] = useState(event?.quantity ? String(event.quantity).replace('.', ',') : '')
  const [unit, setUnit] = useState(event?.unit ?? '')
  const [target, setTarget] = useState(event?.target ?? '')
  const [withholding, setWithholding] = useState(event?.withholding_days ? String(event.withholding_days) : '')
  const [reentry, setReentry] = useState(event?.reentry_hours ? String(event.reentry_hours) : '')
  const [rainFree, setRainFree] = useState(event?.rain_free_hours ? String(event.rain_free_hours) : '')
  const [worker, setWorker] = useState(event?.worker ?? '')
  const [note, setNote] = useState(event?.note ?? '')
  const [when, setWhen] = useState<When>(event ? (event.planned ? 'plan' : 'past') : 'now')
  // Sửa: giờ đã ghi; thêm mới: giờ tới (cho kế hoạch / đã làm lúc…)
  const [initial] = useState(() => (event ? new Date(event.done_at) : new Date(Date.now() + 3600_000)))
  const [date, setDate] = useState(event ? `${initial.getFullYear()}-${pad(initial.getMonth() + 1)}-${pad(initial.getDate())}` : today())
  const [time, setTime] = useState(event ? `${pad(initial.getHours())}:${pad(initial.getMinutes())}` : `${pad(initial.getHours())}:00`)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Chờ gõ xong số giờ rồi mới hỏi lại máy chủ
  const [adviceHours, setAdviceHours] = useState(rainFree)
  useEffect(() => {
    const timer = setTimeout(() => setAdviceHours(rainFree), 600)
    return () => clearTimeout(timer)
  }, [rainFree])
  const wantAdvice = (kind === 'spray' || kind === 'fertilize') && when !== 'past'
  const [advice] = useAsync(
    () => (wantAdvice ? iotApi.workAdvice(plot.id, kind as 'spray' | 'fertilize', kind === 'spray' ? Number(adviceHours) || null : null) : Promise.resolve(null)),
    [plot.id, kind, wantAdvice, kind === 'spray' ? adviceHours : ''],
  )
  const back = `cam-bien/lo/${plot.id}`
  const spray = kind === 'spray'

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (when === 'now' && advice.status === 'ok' && advice.data?.level === 'avoid' && !window.confirm('Thời tiết chưa phù hợp (xem phần Kiểm tra trước khi làm). Vẫn ghi là vừa làm xong?')) return
    let doneAt: string | null = null
    if (when !== 'now') {
      const at = new Date(`${date}T${time || '00:00'}:00`)
      if (Number.isNaN(at.getTime())) return setError('Chọn ngày giờ.')
      if (when === 'past' && at.getTime() > Date.now() + 5 * 60_000) return setError('Giờ đã làm không được sau bây giờ. Muốn làm sau thì chọn "Lên kế hoạch".')
      doneAt = vnIso(at)
    }
    const quantity = qty.trim() ? Number(qty.replace(/\./g, '').replace(',', '.')) : null
    if (quantity !== null && !(quantity >= 0)) return setError('Liều lượng phải là số, VD 2 hoặc 1,5.')
    const input: IotPlotEventInput = {
      kind,
      title: title.trim(),
      quantity,
      unit: unit.trim() || null,
      target: spray ? target.trim() || null : null,
      withholding_days: spray ? Number(withholding) || null : null,
      reentry_hours: spray ? Number(reentry) || null : null,
      rain_free_hours: spray ? Number(rainFree) || null : null,
      worker: worker.trim() || null,
      note: note.trim() || null,
      planned: when === 'plan',
      done_at: doneAt ?? (event && !event.planned ? event.done_at : null),
    }
    setBusy(true)
    try {
      if (event) await iotApi.updatePlotEvent(event.id, input)
      else await iotApi.savePlotEvent(plot.id, { ...input, uuid: crypto.randomUUID(), source: 'manual' })
      void syncFarmWork(true)
      go(back)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <a className="back" href={href(back)}>
        ‹ {plot.name}
      </a>
      <h1>{event ? 'Sửa việc' : when === 'plan' ? 'Lên kế hoạch' : 'Ghi việc làm vườn'}</h1>
      <form className="form card" onSubmit={submit}>
        <fieldset>
          <legend>Việc</legend>
          <div className="segmented wrap">
            {(Object.keys(FARM_LOG_KIND_LABELS) as IotWorkKind[]).map((k) => (
              <button key={k} type="button" className={k === kind ? 'active' : ''} aria-pressed={k === kind} onClick={() => setKind(k)}>
                {FARM_LOG_KIND_LABELS[k]}
              </button>
            ))}
          </div>
        </fieldset>
        <label>
          {TITLE_LABELS[kind].label}
          <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} placeholder={TITLE_LABELS[kind].placeholder} />
        </label>
        <div className="row-2">
          <label>
            Liều lượng
            <input inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="VD 2" />
          </label>
          <label>
            Đơn vị
            <input value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={20} placeholder={kind === 'fertilize' ? 'kg, bao' : 'chai, gói, lít'} />
          </label>
        </div>
        {spray && (
          <>
            <label>
              Trị sâu bệnh gì
              <input value={target} onChange={(e) => setTarget(e.target.value)} maxLength={120} placeholder="VD sâu đục thân, nấm hồng" />
            </label>
            <label>
              Thời gian cách ly (ngày)
              <input inputMode="numeric" value={withholding} onChange={(e) => setWithholding(digits(e.target.value))} placeholder="VD 14" />
              <span className="small muted">Theo nhãn thuốc: chưa hết số ngày này thì chưa thu hoạch.</span>
            </label>
            <Chips value={withholding} presets={WITHHOLDING_PRESETS} unit="ngày" onPick={setWithholding} />
            <label>
              Không vào lô trong (giờ)
              <input inputMode="numeric" value={reentry} onChange={(e) => setReentry(digits(e.target.value))} placeholder="VD 24" />
              <span className="small muted">Theo nhãn thuốc. App báo mọi người không vào lô tới lúc đó.</span>
            </label>
            <Chips value={reentry} presets={REENTRY_PRESETS} unit="giờ" onPick={setReentry} />
            <label>
              Chờ thuốc khô, không mưa / tưới trên tán (giờ)
              <input inputMode="numeric" value={rainFree} onChange={(e) => setRainFree(digits(e.target.value, 2))} placeholder="6" />
              <span className="small muted">Để trống là 6 giờ. Máy tưới trên tán của lô tự tạm dừng tới lúc đó.</span>
            </label>
            <Chips value={rainFree} presets={RAIN_FREE_PRESETS} unit="giờ" onPick={setRainFree} />
          </>
        )}
        <label>
          Người làm
          <input value={worker} onChange={(e) => setWorker(e.target.value)} maxLength={60} placeholder="VD Anh Tư" />
        </label>
        <label>
          Ghi chú
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="VD pha 2 chai / phuy 200 lít" />
        </label>
        <fieldset>
          <legend>Khi nào</legend>
          <div className="segmented wrap">
            {(
              [
                { value: 'now', label: 'Vừa làm xong' },
                { value: 'past', label: 'Đã làm lúc…' },
                { value: 'plan', label: '📅 Lên kế hoạch' },
              ] as { value: When; label: string }[]
            )
              .filter((o) => !(event && !event.planned && o.value === 'now'))
              .map((o) => (
                <button key={o.value} type="button" className={when === o.value ? 'active' : ''} aria-pressed={when === o.value} onClick={() => setWhen(o.value)}>
                  {o.label}
                </button>
              ))}
          </div>
        </fieldset>
        {when !== 'now' && (
          <div className="row-2">
            <DateField label={when === 'plan' ? 'Ngày làm' : 'Ngày đã làm'} value={date} onChange={setDate} max={when === 'past' ? today() : undefined} min={when === 'plan' ? today() : undefined} />
            <label>
              Giờ
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
            </label>
          </div>
        )}
        {when === 'plan' && <p className="small muted">📅 6 giờ sáng ngày đó app nhắc mọi người. Làm xong bấm “✓ Đã làm” trên trang lô.</p>}
        {wantAdvice && <AdviceBox state={advice} />}
        {error && <p className="field-error">{error}</p>}
        <button className="button primary" disabled={busy || !title.trim()}>
          {busy ? 'Đang lưu…' : 'Lưu'}
        </button>
      </form>
    </section>
  )
}

const ADVICE_COLORS = { ok: '#15803d', info: 'var(--muted)', caution: '#a16207', avoid: 'var(--error)' }
const ADVICE_ICONS = { ok: '✅', info: 'ℹ️', caution: '⚠️', avoid: '⛔' }

function AdviceBox({ state }: { state: AsyncState<IotWorkAdvice | null> }) {
  if (state.status === 'loading') return <p className="small muted">Đang kiểm tra thời tiết…</p>
  if (state.status === 'error')
    return (
      <p className="small muted">
        Chưa kiểm tra được thời tiết{state.error instanceof ApiError && state.error.status === 429 ? ' (máy chủ đang bận, mở lại sau ít phút)' : `: ${state.error.message}`}. Vẫn ghi được.
      </p>
    )
  const advice = state.data
  if (!advice) return null
  const best = advice.best_time ? new Date(advice.best_time) : null
  return (
    <div className={`card advice ${advice.level}`}>
      <b>Kiểm tra trước khi làm</b>
      {advice.items.map((item) => (
        <p key={item.text} className="small" style={{ color: ADVICE_COLORS[item.level], margin: '4px 0' }}>
          {ADVICE_ICONS[item.level]} {item.text}
        </p>
      ))}
      {best && (
        <p className="small">
          🕐 Giờ phù hợp gần nhất: <b>{`${pad(best.getHours())}:00 ${formatDate(`${best.getFullYear()}-${pad(best.getMonth() + 1)}-${pad(best.getDate())}`, true)}`}</b>
        </p>
      )}
    </div>
  )
}
