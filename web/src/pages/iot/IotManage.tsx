import {
  ApiError,
  describeCommand,
  describeRule,
  describeSchedule,
  formatDecimal,
  monthsLabel,
  normalizeDevEui,
  parseDecimalInput,
  parseDeviceFile,
  planLabel,
  ROLE_LABELS,
  PROVINCE_CENTERS,
  PROVINCE_NAMES,
  thresholdLabel,
  timeAgo,
  type IotActuator,
  type IotActuatorKind,
  type IotCropPreset,
  type IotDevice,
  type IotFarm,
  type IotIngestResult,
  type IotMetric,
  type IotPlot,
  type IotPlotType,
  type IotRole,
  type IotRule,
  type IotSchedule,
  type IotThreshold,
} from '@nhanong/shared'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Status } from '../../components/Status'
import { go, href, useAsync } from '../../hooks'
import { iotApi, useIotAuth } from '../../iot'

/**
 * Thêm / sửa trên web (giống app): trang trại, lô, thiết bị đo, ngưỡng (+ gợi ý theo cây), máy bơm / quạt (+ khóa an toàn),
 * luật tự động, lịch tưới, lịch sử bật / tắt, gửi file dữ liệu tải từ thiết bị, gói đang dùng.
 */

type Errors = { fields: Record<string, string[]>; message: string | null }
const NO_ERRORS: Errors = { fields: {}, message: null }

function toErrors(error: unknown): Errors {
  if (error instanceof ApiError) return { fields: error.errors, message: Object.keys(error.errors).length ? null : error.message }
  return { fields: {}, message: (error as Error).message }
}

function Back({ to, label }: { to: string; label: string }) {
  return (
    <a className="back" href={href(to)}>
      ‹ {label}
    </a>
  )
}

function Field({ label, error, hint, children }: { label: string; error?: string[]; hint?: string; children: ReactNode }) {
  return (
    <label>
      {label}
      {children}
      {error ? <span className="field-error">{error[0]}</span> : hint ? <span className="small muted">{hint}</span> : null}
    </label>
  )
}

function Choices<T extends string | number | boolean | null>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented wrap">
      {options.map((o) => (
        <button key={String(o.value)} type="button" className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Message({ errors }: { errors: Errors }) {
  return errors.message ? <p className="field-error">{errors.message}</p> : null
}

function DeleteLink({ label, confirmText, onConfirm }: { label: string; confirmText: string; onConfirm: () => Promise<void> }) {
  return (
    <p className="center">
      <button
        type="button"
        className="linklike"
        style={{ color: 'var(--error)' }}
        onClick={() => {
          if (window.confirm(confirmText)) void onConfirm()
        }}
      >
        {label}
      </button>
    </p>
  )
}

// ---------- Trang trại ----------

export function FarmForm({ id }: { id: number | null }) {
  const [farms, reload] = useAsync(() => (id ? iotApi.farms() : Promise.resolve([])), [id])
  if (farms.status !== 'ok') return <Status state={farms} retry={reload} />
  const farm = id ? farms.data.find((f) => f.id === id) : undefined
  if (id && !farm) return <p className="notice">Không tìm thấy trang trại.</p>
  return <FarmFormInner farm={farm} />
}

function FarmFormInner({ farm }: { farm?: IotFarm }) {
  const [name, setName] = useState(farm?.name ?? '')
  const [province, setProvince] = useState(farm?.province ?? '')
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(farm?.lat != null && farm?.lng != null ? { lat: farm.lat, lng: farm.lng } : null)
  const [rainAlerts, setRainAlerts] = useState(farm?.rain_alerts ?? true)
  const [dryDays, setDryDays] = useState<number>(farm?.dry_alert_days ?? 7)
  const [gps, setGps] = useState<string | null>(null)
  const [errors, setErrors] = useState(NO_ERRORS)
  const [busy, setBusy] = useState(false)

  const pickProvince = (code: string) => {
    setProvince(PROVINCE_NAMES[code] ?? '')
    if (PROVINCE_CENTERS[code]) setPoint({ lat: PROVINCE_CENTERS[code][0], lng: PROVINCE_CENTERS[code][1] })
  }

  const locate = () => {
    if (!navigator.geolocation) return setGps('Trình duyệt không lấy được vị trí. Hãy chọn tỉnh.')
    setGps('Đang lấy vị trí…')
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPoint({ lat: Math.round(p.coords.latitude * 1e4) / 1e4, lng: Math.round(p.coords.longitude * 1e4) / 1e4 })
        setGps('Đã lấy vị trí hiện tại (nên đứng tại trang trại khi bấm).')
      },
      () => setGps('Không lấy được vị trí. Hãy chọn tỉnh.'),
    )
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErrors(NO_ERRORS)
    try {
      const input = { name: name.trim(), province: province || null, lat: point?.lat ?? null, lng: point?.lng ?? null, rain_alerts: rainAlerts, dry_alert_days: dryDays }
      if (farm) await iotApi.updateFarm(farm.id, input)
      else await iotApi.createFarm(input)
      go('cam-bien')
    } catch (err) {
      setErrors(toErrors(err))
    } finally {
      setBusy(false)
    }
  }

  const provinceCode = Object.entries(PROVINCE_NAMES).find(([, n]) => n === province)?.[0] ?? ''

  return (
    <section>
      <Back to="cam-bien" label="Cảm biến" />
      <h1>{farm ? 'Sửa trang trại' : 'Thêm trang trại'}</h1>
      <form className="form card" onSubmit={submit}>
        <Field label="Tên trang trại" error={errors.fields.name}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Vườn sầu riêng nhà ông Ba" required />
        </Field>
        <Field label="Tỉnh (để xem dự báo thời tiết)">
          <select value={provinceCode} onChange={(e) => pickProvince(e.target.value)}>
            <option value="">— Chọn tỉnh —</option>
            {Object.entries(PROVINCE_NAMES)
              .sort((a, b) => a[1].localeCompare(b[1], 'vi'))
              .map(([code, n]) => (
                <option key={code} value={code}>
                  {n}
                </option>
              ))}
          </select>
        </Field>
        <p className="small muted">{point ? `Tọa độ: ${point.lat}, ${point.lng}` : 'Chưa có tọa độ'}</p>
        <button type="button" onClick={locate}>
          📡 Dùng vị trí hiện tại
        </button>
        {gps && <p className="small muted">{gps}</p>}
        <fieldset>
          <legend>🌧️ Báo khi trời bắt đầu mưa tại vườn</legend>
          <Choices value={rainAlerts} options={[{ value: true, label: 'Có' }, { value: false, label: 'Không' }]} onChange={setRainAlerts} />
        </fieldset>
        <fieldset>
          <legend>☀️ Nhắc khi lâu ngày không mưa</legend>
          <Choices value={dryDays} options={[0, 5, 7, 10, 14].map((n) => ({ value: n, label: n === 0 ? 'Tắt' : `${n} ngày` }))} onChange={setDryDays} />
        </fieldset>
        <Message errors={errors} />
        <button className="button primary" disabled={busy}>
          {busy ? 'Đang lưu…' : 'Lưu'}
        </button>
      </form>
      {farm && (
        <DeleteLink
          label="Xóa trang trại"
          confirmText={`Xóa "${farm.name}" cùng mọi lô, thiết bị và số đo? Không lấy lại được.`}
          onConfirm={() => iotApi.deleteFarm(farm.id).then(() => go('cam-bien'))}
        />
      )}
    </section>
  )
}

// ---------- Lô ----------

const PLOT_TYPES: { value: IotPlotType; label: string }[] = [
  { value: 'field', label: '🌾 Ruộng' },
  { value: 'garden', label: '🌳 Vườn' },
  { value: 'pond', label: '🦐 Ao nuôi' },
  { value: 'greenhouse', label: '🏠 Nhà màng' },
  { value: 'other', label: 'Khác' },
]

export function PlotForm({ id, farmId }: { id: number | null; farmId: number | null }) {
  const [farms, reload] = useAsync(() => iotApi.farms(), [])
  if (farms.status !== 'ok') return <Status state={farms} retry={reload} />
  const plot = id ? farms.data.flatMap((f) => f.plots).find((p) => p.id === id) : undefined
  return <PlotFormInner plot={plot} farmId={plot?.farm_id ?? farmId ?? 0} />
}

function PlotFormInner({ plot, farmId }: { plot?: IotPlot; farmId: number }) {
  const [name, setName] = useState(plot?.name ?? '')
  const [type, setType] = useState<IotPlotType>(plot?.type ?? 'garden')
  const [crop, setCrop] = useState(plot?.crop ?? '')
  const [area, setArea] = useState(plot?.area_m2 ? String(plot.area_m2) : '')
  const [errors, setErrors] = useState(NO_ERRORS)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErrors(NO_ERRORS)
    try {
      const input = { name: name.trim(), type, crop: crop.trim() || null, area_m2: Number(area.replace(/\D/g, '')) || null }
      const saved = plot ? await iotApi.updatePlot(plot.id, input) : await iotApi.createPlot(farmId, input)
      go(`cam-bien/lo/${saved.id}`)
    } catch (err) {
      setErrors(toErrors(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <Back to={plot ? `cam-bien/lo/${plot.id}` : 'cam-bien'} label={plot ? plot.name : 'Cảm biến'} />
      <h1>{plot ? 'Sửa lô' : 'Thêm lô / ruộng / ao'}</h1>
      <form className="form card" onSubmit={submit}>
        <Field label="Tên" error={errors.fields.name}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Vườn A" required />
        </Field>
        <fieldset>
          <legend>Loại</legend>
          <Choices value={type} options={PLOT_TYPES} onChange={setType} />
        </fieldset>
        <Field label={type === 'pond' ? 'Con nuôi' : 'Cây trồng'} error={errors.fields.crop}>
          <input value={crop} onChange={(e) => setCrop(e.target.value)} placeholder={type === 'pond' ? 'VD: Tôm thẻ' : 'VD: Sầu riêng Ri6'} />
        </Field>
        <Field label="Diện tích (m²)" error={errors.fields.area_m2}>
          <input inputMode="numeric" value={area} onChange={(e) => setArea(e.target.value)} />
        </Field>
        <Message errors={errors} />
        <button className="button primary" disabled={busy}>
          {busy ? 'Đang lưu…' : 'Lưu'}
        </button>
      </form>
      {plot && (
        <DeleteLink
          label="Xóa lô"
          confirmText={`Xóa "${plot.name}" và các ngưỡng, luật của lô? Thiết bị vẫn giữ, chỉ bỏ gán lô.`}
          onConfirm={() => iotApi.deletePlot(plot.id).then(() => go('cam-bien'))}
        />
      )}
    </section>
  )
}

// ---------- Thiết bị đo ----------

export function DeviceForm({ id, farmId, plotId }: { id: number | null; farmId: number | null; plotId: number | null }) {
  const [data, reload] = useAsync(() => Promise.all([iotApi.farms(), iotApi.devices(), iotApi.deviceProfiles()]), [])
  if (data.status !== 'ok') return <Status state={data} retry={reload} />
  const [farms, devices, profiles] = data.data
  const device = id ? devices.find((d) => d.id === id) : undefined
  const farm = farms.find((f) => f.id === (device?.farm_id ?? farmId))
  if (!farm) return <p className="notice">Không tìm thấy trang trại.</p>
  return <DeviceFormInner farm={farm} device={device} plotId={device ? device.plot_id : plotId} profiles={profiles.map((p) => ({ code: p.code, hint: p.metrics.join(', ') }))} />
}

function DeviceFormInner({ farm, device, plotId: initialPlot, profiles }: { farm: IotFarm; device?: IotDevice; plotId: number | null; profiles: { code: string; hint: string }[] }) {
  const [name, setName] = useState(device?.name ?? '')
  const [kind, setKind] = useState<'esp32' | 'lorawan'>(device?.kind ?? 'esp32')
  const [plotId, setPlotId] = useState<number | null>(initialPlot)
  const [devEui, setDevEui] = useState(device?.dev_eui ?? '')
  const [profile, setProfile] = useState(device?.profile ?? 'generic')
  const [errors, setErrors] = useState(NO_ERRORS)
  const [busy, setBusy] = useState(false)
  const [key, setKey] = useState<{ device: IotDevice; key: string } | null>(null)

  const input = () => ({
    farm_id: farm.id,
    plot_id: plotId,
    name: name.trim(),
    kind,
    profile: kind === 'lorawan' ? profile : 'generic',
    dev_eui: kind === 'lorawan' ? normalizeDevEui(devEui) || null : null,
  })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErrors(NO_ERRORS)
    try {
      if (device) {
        await iotApi.updateDevice(device.id, input())
        go(plotId ? `cam-bien/lo/${plotId}` : 'cam-bien')
      } else {
        const result = await iotApi.createDevice(input())
        if (kind === 'esp32') setKey({ device: result.data, key: result.api_key })
        else go(plotId ? `cam-bien/lo/${plotId}` : 'cam-bien')
      }
    } catch (err) {
      setErrors(toErrors(err))
    } finally {
      setBusy(false)
    }
  }

  const rotate = async () => {
    if (!device || !window.confirm('Tạo khóa mới? Khóa cũ hết hiệu lực ngay, thiết bị phải nạp khóa mới.')) return
    await iotApi.rotateDeviceKey(device.id).then((r) => setKey({ device: r.data, key: r.api_key }), (err) => setErrors(toErrors(err)))
  }

  if (key) {
    return (
      <section>
        <h1>Khóa thiết bị</h1>
        <div className="card" style={{ borderLeft: '6px solid #e8a10c' }}>
          <p>
            <b>Nạp 2 dòng này vào firmware (file config.h).</b> Khóa chỉ hiện 1 lần; lỡ mất thì vào Sửa thiết bị › Tạo khóa mới.
          </p>
          <pre style={{ background: '#eef3ea', padding: 12, borderRadius: 10, overflowX: 'auto' }}>{`DEVICE_UID "${key.device.uid}"\nDEVICE_KEY "${key.key}"`}</pre>
          <div className="btn-row">
            <button type="button" onClick={() => void navigator.clipboard?.writeText(`DEVICE_UID "${key.device.uid}"\nDEVICE_KEY "${key.key}"`)}>
              📋 Chép
            </button>
            <a className="button primary" href={href(plotId ? `cam-bien/lo/${plotId}` : 'cam-bien')}>
              Xong
            </a>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section>
      <Back to={plotId ? `cam-bien/lo/${plotId}` : 'cam-bien'} label="Quay lại" />
      <h1>{device ? 'Sửa thiết bị đo' : 'Thêm thiết bị đo'}</h1>
      {device && <p className="muted">Mã thiết bị: {device.uid}</p>}
      <form className="form card" onSubmit={submit}>
        <Field label="Tên thiết bị" error={errors.fields.name}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Đo đất vườn A" required />
        </Field>
        <fieldset>
          <legend>Kết nối</legend>
          <Choices
            value={kind}
            options={[
              { value: 'esp32', label: '📶 WiFi / 4G (ESP32)' },
              { value: 'lorawan', label: '📡 LoRaWAN' },
            ]}
            onChange={setKind}
          />
        </fieldset>
        <fieldset>
          <legend>Đặt ở lô ({farm.name})</legend>
          <Choices value={plotId} options={[{ value: null, label: 'Chưa gán' }, ...farm.plots.map((p) => ({ value: p.id, label: p.name }))]} onChange={setPlotId} />
        </fieldset>
        {kind === 'lorawan' && (
          <>
            <Field label="DevEUI" error={errors.fields.dev_eui} hint="16 ký tự in trên nhãn thiết bị, VD A8:40:41:00:01:81:C2:7A">
              <input value={devEui} onChange={(e) => setDevEui(e.target.value)} />
            </Field>
            <fieldset>
              <legend>Dòng thiết bị</legend>
              <Choices value={profile} options={profiles.map((p) => ({ value: p.code, label: p.code === 'generic' ? 'Khác (tự khai báo)' : p.code }))} onChange={setProfile} />
            </fieldset>
            <p className="small muted">{profiles.find((p) => p.code === profile)?.hint || 'Tên trường do decoder trả về phải trùng mã chỉ số (VD soil_ph, water_level).'}</p>
          </>
        )}
        <Message errors={errors} />
        <div className="btn-row">
          <button className="button primary" disabled={busy}>
            {busy ? 'Đang lưu…' : 'Lưu'}
          </button>
          {device?.kind === 'esp32' && (
            <button type="button" onClick={rotate}>
              🔑 Tạo khóa mới
            </button>
          )}
        </div>
      </form>
      {device && (
        <DeleteLink
          label="Xóa thiết bị"
          confirmText={`Xóa "${device.name}" cùng mọi số đo? Không lấy lại được.`}
          onConfirm={() => iotApi.deleteDevice(device.id).then(() => go('cam-bien'))}
        />
      )}
    </section>
  )
}

// ---------- Ngưỡng + gợi ý theo cây ----------

const GROUPS: Record<IotPlotType, IotMetric['group'][]> = {
  pond: ['water'],
  field: ['water', 'soil'],
  garden: ['soil', 'weather'],
  greenhouse: ['soil', 'weather'],
  other: ['soil', 'water', 'weather'],
}

export function ThresholdsPage({ plotId, plotName, type }: { plotId: number; plotName: string; type: IotPlotType }) {
  const [data, reload] = useAsync(() => Promise.all([iotApi.thresholds(plotId), iotApi.metrics(), iotApi.cropPresets()]), [plotId])
  const [editing, setEditing] = useState<{ metric: IotMetric; threshold?: IotThreshold } | null>(null)
  const [applied, setApplied] = useState<IotCropPreset | null>(null)
  const [showAll, setShowAll] = useState(false)
  if (data.status !== 'ok') return <Status state={data} retry={reload} />
  const [thresholds, metrics, presets] = data.data
  const metricOf = (code: string) => metrics.find((m) => m.code === code)

  if (editing) return <ThresholdForm plotId={plotId} {...editing} onDone={() => (setEditing(null), reload())} />

  const apply = async (preset: IotCropPreset) => {
    if (!window.confirm(`Dùng gợi ý cho ${preset.name}? Đặt ngưỡng theo tài liệu kỹ thuật (ghi đè ngưỡng cùng chỉ số).`)) return
    await iotApi.applyPreset(plotId, preset.code)
    setApplied(preset)
    reload()
  }

  return (
    <section>
      <Back to={`cam-bien/lo/${plotId}`} label={plotName || 'Lô'} />
      <h1>Ngưỡng cảnh báo</h1>
      <p className="muted">Số đo ra ngoài ngưỡng thì báo về điện thoại (1 lần, tới khi số đo trở lại bình thường).</p>
      <h2 className="section-title">Đang đặt</h2>
      {thresholds.length === 0 && <p className="muted">Chưa đặt ngưỡng nào.</p>}
      {thresholds.map((t) => {
        const metric = metricOf(t.metric)
        return (
          <button key={t.id} type="button" className="card" style={{ display: 'block', width: '100%', textAlign: 'left' }} onClick={() => metric && setEditing({ metric, threshold: t })}>
            <b>{metric?.name ?? t.metric}</b> · {thresholdLabel(t.min, t.max)}
            {metric?.unit ? ` ${metric.unit}` : ''}
            {t.note && (
              <>
                <br />
                <span className="small muted">{t.note}</span>
              </>
            )}
          </button>
        )
      })}
      <h2 className="section-title">Gợi ý theo cây trồng</h2>
      <div className="segmented wrap">
        {presets.map((p) => (
          <button key={p.code} type="button" className={applied?.code === p.code ? 'active' : ''} onClick={() => void apply(p)}>
            {p.name}
          </button>
        ))}
      </div>
      {applied && <PresetNotes preset={applied} />}
      <h2 className="section-title">Thêm ngưỡng</h2>
      <div className="segmented wrap">
        {metrics
          .filter((m) => m.group !== 'device' && (showAll || GROUPS[type].includes(m.group)) && !thresholds.some((t) => t.metric === m.code))
          .map((m) => (
            <button key={m.code} type="button" onClick={() => setEditing({ metric: m })}>
              ＋ {m.name}
            </button>
          ))}
      </div>
      <p>
        <button type="button" className="linklike" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Chỉ hiện chỉ số hay dùng' : 'Hiện tất cả chỉ số'}
        </button>
      </p>
    </section>
  )
}

function PresetNotes({ preset }: { preset: IotCropPreset }) {
  return (
    <div className="card" style={{ borderLeft: '6px solid #e8a10c' }}>
      <b>Đã đặt ngưỡng gợi ý cho {preset.name}</b>
      <ul className="small">
        {[...preset.thresholds.map((t) => t.note), ...(preset.schedule ? [`Lịch tưới: ${preset.schedule.note}`] : []), ...(preset.interlock ? [preset.interlock.note] : []), ...preset.notes].map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
      {preset.sources.map((s) => (
        <p key={s.url} className="small">
          📄{' '}
          <a href={s.url} target="_blank" rel="noreferrer">
            {s.title}
          </a>
        </p>
      ))}
    </div>
  )
}

function ThresholdForm({ plotId, metric, threshold, onDone }: { plotId: number; metric: IotMetric; threshold?: IotThreshold; onDone: () => void }) {
  const [min, setMin] = useState(threshold?.min != null ? formatDecimal(threshold.min) : '')
  const [max, setMax] = useState(threshold?.max != null ? formatDecimal(threshold.max) : '')
  const [note, setNote] = useState(threshold?.note ?? '')
  const [errors, setErrors] = useState(NO_ERRORS)
  const unit = metric.unit ? ` (${metric.unit})` : ''

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const minValue = parseDecimalInput(min)
    const maxValue = parseDecimalInput(max)
    if (Number.isNaN(minValue) || Number.isNaN(maxValue)) return setErrors({ fields: {}, message: 'Nhập số, VD 7,5.' })
    if (minValue === null && maxValue === null) return setErrors({ fields: {}, message: 'Cần ít nhất mức thấp nhất hoặc cao nhất.' })
    try {
      await iotApi.saveThreshold(plotId, { metric: metric.code, min: minValue, max: maxValue, note: note.trim() || null })
      onDone()
    } catch (err) {
      setErrors(toErrors(err))
    }
  }

  return (
    <section>
      <h1>{metric.name}</h1>
      <form className="form card" onSubmit={submit}>
        <Field label={`Thấp nhất${unit}`} error={errors.fields.min}>
          <input inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} placeholder="Bỏ trống: không báo khi thấp" />
        </Field>
        <Field label={`Cao nhất${unit}`} error={errors.fields.max}>
          <input inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} placeholder="Bỏ trống: không báo khi cao" />
        </Field>
        <Field label="Ghi chú" error={errors.fields.note}>
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Message errors={errors} />
        <div className="btn-row">
          <button className="button primary">Lưu ngưỡng</button>
          <button type="button" onClick={onDone}>
            Quay lại
          </button>
        </div>
      </form>
      {threshold && (
        <DeleteLink label="Bỏ ngưỡng này" confirmText={`Không báo khi ${metric.name} vượt ngưỡng nữa?`} onConfirm={() => iotApi.deleteThreshold(threshold.id).then(onDone)} />
      )}
    </section>
  )
}

// ---------- Máy bơm / quạt (+ khóa an toàn) ----------

const ACTUATOR_KINDS: { value: IotActuatorKind; label: string }[] = [
  { value: 'pump', label: '💧 Máy bơm' },
  { value: 'aerator', label: '🌀 Quạt oxy' },
  { value: 'valve', label: '🚰 Van / cống' },
  { value: 'mister', label: '🌫️ Phun sương' },
  { value: 'light', label: '💡 Đèn' },
  { value: 'other', label: '🔌 Khác' },
]

const BLOCK_METRICS = [
  { value: 'salinity', label: 'Độ mặn (‰)' },
  { value: 'water_ec', label: 'EC nước (µS/cm)' },
  { value: 'water_level', label: 'Mực nước (cm)' },
]

export function ActuatorForm({ id, plotId }: { id: number | null; plotId: number }) {
  const [data, reload] = useAsync(() => Promise.all([iotApi.devices(), iotApi.actuators(plotId), iotApi.farms()]), [plotId])
  if (data.status !== 'ok') return <Status state={data} retry={reload} />
  const [devices, actuators, farms] = data.data
  const actuator = id ? actuators.find((a) => a.id === id) : undefined
  const farmId = farms.find((f) => f.plots.some((p) => p.id === plotId))?.id
  const farmDevices = devices.filter((d) => d.farm_id === farmId)
  return <ActuatorFormInner actuator={actuator} plotId={plotId} controllers={farmDevices.filter((d) => d.kind === 'esp32')} sensors={farmDevices} />
}

function ActuatorFormInner({ actuator, plotId, controllers, sensors }: { actuator?: IotActuator; plotId: number; controllers: IotDevice[]; sensors: IotDevice[] }) {
  const [deviceId, setDeviceId] = useState<number | null>(actuator?.device_id ?? controllers.find((d) => d.plot_id === plotId)?.id ?? controllers[0]?.id ?? null)
  const [name, setName] = useState(actuator?.name ?? '')
  const [kind, setKind] = useState<IotActuatorKind>(actuator?.kind ?? 'pump')
  const [channel, setChannel] = useState(String(actuator?.channel ?? 1))
  const [maxMinutes, setMaxMinutes] = useState(String(actuator?.max_minutes ?? 60))
  const [blockDeviceId, setBlockDeviceId] = useState<number | null>(actuator?.block?.device_id ?? null)
  const [blockMetric, setBlockMetric] = useState(actuator?.block?.metric ?? 'salinity')
  const [blockOperator, setBlockOperator] = useState<'above' | 'below'>(actuator?.block?.operator ?? 'above')
  const [blockValue, setBlockValue] = useState(actuator?.block ? formatDecimal(actuator.block.value) : '0,3')
  const [errors, setErrors] = useState(NO_ERRORS)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (deviceId === null) return
    const value = parseDecimalInput(blockValue)
    if (blockDeviceId !== null && (value === null || Number.isNaN(value))) return setErrors({ fields: {}, message: 'Nhập mức chặn là số, VD 0,3.' })
    setBusy(true)
    setErrors(NO_ERRORS)
    try {
      const input = {
        name: name.trim(),
        kind,
        channel: Number(channel) || 0,
        plot_id: actuator?.plot_id ?? plotId,
        max_minutes: Number(maxMinutes) || 60,
        block_device_id: blockDeviceId,
        block_metric: blockDeviceId === null ? null : blockMetric,
        block_operator: blockDeviceId === null ? null : blockOperator,
        block_value: blockDeviceId === null ? null : value,
      }
      if (actuator) await iotApi.updateActuator(actuator.id, input)
      else await iotApi.createActuator(deviceId, input)
      go(`cam-bien/lo/${plotId}`)
    } catch (err) {
      setErrors(toErrors(err))
    } finally {
      setBusy(false)
    }
  }

  if (controllers.length === 0 && !actuator) {
    return (
      <section>
        <Back to={`cam-bien/lo/${plotId}`} label="Quay lại" />
        <p className="notice">Trang trại chưa có mạch ESP32 nào. Thêm thiết bị đo loại "WiFi / 4G (ESP32)" cho mạch relay trước.</p>
      </section>
    )
  }

  return (
    <section>
      <Back to={`cam-bien/lo/${plotId}`} label="Quay lại" />
      <h1>{actuator ? 'Sửa máy bơm / quạt' : 'Thêm máy bơm / quạt'}</h1>
      <form className="form card" onSubmit={submit}>
        <Field label="Tên" error={errors.fields.name}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Bơm tưới vườn A" required />
        </Field>
        <fieldset>
          <legend>Loại</legend>
          <Choices value={kind} options={ACTUATOR_KINDS} onChange={setKind} />
        </fieldset>
        {!actuator && (
          <fieldset>
            <legend>Mạch điều khiển (relay)</legend>
            <Choices value={deviceId} options={controllers.map((d) => ({ value: d.id, label: d.name }))} onChange={setDeviceId} />
          </fieldset>
        )}
        <Field label="Kênh relay" error={errors.fields.channel} hint="Số in cạnh ổ cắm relay trên mạch (1, 2, 3…)">
          <input inputMode="numeric" value={channel} onChange={(e) => setChannel(e.target.value)} />
        </Field>
        <Field label="Chạy tối đa mỗi lần (phút)" error={errors.fields.max_minutes} hint="Mạch tự tắt khi hết giờ, kể cả lúc mất mạng.">
          <input inputMode="numeric" value={maxMinutes} onChange={(e) => setMaxMinutes(e.target.value)} />
        </Field>
        <fieldset className="card">
          <legend>🔒 Khóa an toàn (không bắt buộc)</legend>
          <p className="small muted">Theo cảm biến nguồn nước: vượt mức thì không cho bơm (kể cả lịch tưới, luật tự động), đang chạy thì tự tắt. VD sầu riêng: nước tưới mặn trên 0,3‰.</p>
          <Choices value={blockDeviceId} options={[{ value: null, label: 'Không dùng' }, ...sensors.map((d) => ({ value: d.id, label: d.name }))]} onChange={setBlockDeviceId} />
          {blockDeviceId !== null && (
            <>
              <p className="small">Chỉ số</p>
              <Choices value={blockMetric} options={BLOCK_METRICS} onChange={setBlockMetric} />
              <p className="small">Chặn khi</p>
              <Choices
                value={blockOperator}
                options={[
                  { value: 'above', label: 'Cao hơn' },
                  { value: 'below', label: 'Thấp hơn' },
                ]}
                onChange={setBlockOperator}
              />
              <Field label="Mức chặn" error={errors.fields.block_value} hint="Mực nước: chọn 'Thấp hơn' để bơm không chạy khô khi hết nước.">
                <input inputMode="decimal" value={blockValue} onChange={(e) => setBlockValue(e.target.value)} />
              </Field>
            </>
          )}
        </fieldset>
        <Message errors={errors} />
        <button className="button primary" disabled={busy}>
          {busy ? 'Đang lưu…' : 'Lưu'}
        </button>
      </form>
      {actuator && (
        <DeleteLink
          label="Xóa máy"
          confirmText={`Xóa "${actuator.name}" cùng lịch tưới, luật tự động dùng nó?`}
          onConfirm={() => iotApi.deleteActuator(actuator.id).then(() => go(`cam-bien/lo/${plotId}`))}
        />
      )}
    </section>
  )
}

// ---------- Luật tự động ----------

export function RulesPage({ plotId, plotName, type }: { plotId: number; plotName: string; type: IotPlotType }) {
  const [data, reload] = useAsync(() => Promise.all([iotApi.rules(plotId), iotApi.actuators(plotId), iotApi.metrics()]), [plotId])
  const [editing, setEditing] = useState<IotRule | 'new' | null>(null)
  if (data.status !== 'ok') return <Status state={data} retry={reload} />
  const [rules, actuators, metrics] = data.data

  if (editing) {
    return (
      <RuleForm
        plotId={plotId}
        rule={editing === 'new' ? undefined : editing}
        actuators={actuators}
        metrics={metrics.filter((m) => GROUPS[type].includes(m.group))}
        onDone={() => (setEditing(null), reload())}
      />
    )
  }

  return (
    <section>
      <Back to={`cam-bien/lo/${plotId}`} label={plotName || 'Lô'} />
      <h1>⚡ Luật tự động</h1>
      <p className="muted">Số đo vượt mức thì tự bật máy và báo về điện thoại. Có thời gian nghỉ giữa 2 lần bật; máy bạn bật tay thì luật không tự tắt.</p>
      {actuators.length === 0 && <p className="notice">Lô chưa có máy bơm / quạt điều khiển được.</p>}
      {rules.length === 0 && <p className="muted">Chưa có luật nào.</p>}
      {rules.map((rule) => (
        <button key={rule.id} type="button" className="card" style={{ display: 'block', width: '100%', textAlign: 'left', opacity: rule.enabled ? 1 : 0.6 }} onClick={() => setEditing(rule)}>
          <b>{describeRule(rule)}</b>
          <br />
          <span className="small muted">
            {rule.enabled ? 'Đang dùng' : 'Đang tạm tắt'} · nghỉ {rule.cooldown_minutes} phút giữa 2 lần
            {rule.last_triggered_at ? ` · chạy lần cuối ${timeAgo(rule.last_triggered_at)}` : ''}
          </span>
        </button>
      ))}
      {actuators.length > 0 && (
        <button type="button" className="button primary" onClick={() => setEditing('new')}>
          ＋ Thêm luật
        </button>
      )}
    </section>
  )
}

function RuleForm({ plotId, rule, actuators, metrics, onDone }: { plotId: number; rule?: IotRule; actuators: IotActuator[]; metrics: IotMetric[]; onDone: () => void }) {
  const [metric, setMetric] = useState(rule?.metric.code ?? metrics[0]?.code ?? '')
  const [operator, setOperator] = useState<'below' | 'above'>(rule?.operator ?? 'below')
  const [value, setValue] = useState(rule ? formatDecimal(rule.value) : '')
  const [offValue, setOffValue] = useState(rule?.off_value != null ? formatDecimal(rule.off_value) : '')
  const [actuatorId, setActuatorId] = useState(rule?.actuator.id ?? actuators[0]?.id ?? 0)
  const [minutes, setMinutes] = useState(String(rule?.minutes ?? 60))
  const [cooldown, setCooldown] = useState(String(rule?.cooldown_minutes ?? 30))
  const [enabled, setEnabled] = useState(rule?.enabled ?? true)
  const [errors, setErrors] = useState(NO_ERRORS)
  const unit = metrics.find((m) => m.code === metric)?.unit

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const v = parseDecimalInput(value)
    const off = parseDecimalInput(offValue)
    if (v === null || Number.isNaN(v) || Number.isNaN(off)) return setErrors({ fields: {}, message: 'Nhập mức bật là số, VD 4 hoặc 7,5.' })
    try {
      const input = { metric, actuator_id: actuatorId, operator, value: v, off_value: off, minutes: Number(minutes) || 60, cooldown_minutes: Number(cooldown) || 30, enabled }
      if (rule) await iotApi.updateRule(rule.id, input)
      else await iotApi.createRule(plotId, input)
      onDone()
    } catch (err) {
      setErrors(toErrors(err))
    }
  }

  return (
    <section>
      <h1>{rule ? 'Sửa luật' : 'Thêm luật tự động'}</h1>
      <form className="form card" onSubmit={submit}>
        <fieldset>
          <legend>Khi chỉ số</legend>
          <Choices value={metric} options={metrics.map((m) => ({ value: m.code, label: m.name }))} onChange={setMetric} />
        </fieldset>
        <fieldset>
          <legend>Xuống thấp hay lên cao</legend>
          <Choices
            value={operator}
            options={[
              { value: 'below', label: 'Thấp hơn' },
              { value: 'above', label: 'Cao hơn' },
            ]}
            onChange={setOperator}
          />
        </fieldset>
        <Field label={`Mức bật${unit ? ` (${unit})` : ''}`} error={errors.fields.value}>
          <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="VD 4" />
        </Field>
        <fieldset>
          <legend>Thì bật</legend>
          <Choices value={actuatorId} options={actuators.map((a) => ({ value: a.id, label: a.name }))} onChange={setActuatorId} />
        </fieldset>
        <Field label="Chạy (phút)" error={errors.fields.minutes}>
          <input inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </Field>
        <Field label={`Tắt sớm khi trở lại mức${unit ? ` (${unit})` : ''}`} error={errors.fields.off_value} hint={operator === 'below' ? 'Phải lớn hơn mức bật, VD bật khi < 4 thì tắt khi ≥ 5' : 'Phải nhỏ hơn mức bật'}>
          <input inputMode="decimal" value={offValue} onChange={(e) => setOffValue(e.target.value)} placeholder="Bỏ trống: chạy đủ số phút" />
        </Field>
        <Field label="Nghỉ giữa 2 lần tự bật (phút)" error={errors.fields.cooldown_minutes}>
          <input inputMode="numeric" value={cooldown} onChange={(e) => setCooldown(e.target.value)} />
        </Field>
        <fieldset>
          <legend>Trạng thái</legend>
          <Choices value={enabled} options={[{ value: true, label: 'Đang dùng' }, { value: false, label: 'Tạm tắt' }]} onChange={setEnabled} />
        </fieldset>
        <Message errors={errors} />
        <div className="btn-row">
          <button className="button primary">Lưu luật</button>
          <button type="button" onClick={onDone}>
            Quay lại
          </button>
        </div>
      </form>
      {rule && <DeleteLink label="Xóa luật" confirmText={`Xóa luật: ${describeRule(rule)}?`} onConfirm={() => iotApi.deleteRule(rule.id).then(onDone)} />}
    </section>
  )
}

// ---------- Lịch tưới ----------

const DRY_SEASON = [12, 1, 2, 3, 4]

export function SchedulesPage({ plotId, plotName }: { plotId: number; plotName: string }) {
  const [data, reload] = useAsync(() => Promise.all([iotApi.schedules(plotId), iotApi.actuators(plotId), iotApi.cropPresets()]), [plotId])
  const [editing, setEditing] = useState<IotSchedule | 'new' | null>(null)
  if (data.status !== 'ok') return <Status state={data} retry={reload} />
  const [schedules, actuators, presets] = data.data

  if (editing) {
    return (
      <ScheduleForm
        schedule={editing === 'new' ? undefined : editing}
        actuators={actuators}
        presets={presets.filter((p) => p.schedule !== null)}
        onDone={() => (setEditing(null), reload())}
      />
    )
  }

  return (
    <section>
      <Back to={`cam-bien/lo/${plotId}`} label={plotName || 'Lô'} />
      <h1>🗓️ Lịch tưới</h1>
      <p className="muted">Tới giờ tự bật máy bơm, chạy đủ số phút rồi tự tắt; có thể chỉ tưới mùa khô và bỏ lượt khi vườn vừa mưa đủ.</p>
      {actuators.length === 0 && <p className="notice">Lô chưa có máy bơm / van điều khiển được.</p>}
      {schedules.length === 0 && <p className="muted">Chưa có lịch tưới nào.</p>}
      {schedules.map((s) => (
        <button key={s.id} type="button" className="card" style={{ display: 'block', width: '100%', textAlign: 'left', opacity: s.enabled ? 1 : 0.6 }} onClick={() => setEditing(s)}>
          <b>{s.actuator.name}</b>: {describeSchedule(s)}
          <br />
          <span className="small muted">
            {s.enabled ? `Lượt tới: ${s.next_run_on.split('-').reverse().slice(0, 2).join('/')}` : 'Đang tạm tắt'}
            {s.last_run_at ? ` · lần trước ${timeAgo(s.last_run_at)}` : ''}
            {s.note ? ` · ${s.note}` : ''}
          </span>
        </button>
      ))}
      {actuators.length > 0 && (
        <button type="button" className="button primary" onClick={() => setEditing('new')}>
          ＋ Thêm lịch tưới
        </button>
      )}
    </section>
  )
}

function ScheduleForm({ schedule, actuators, presets, onDone }: { schedule?: IotSchedule; actuators: IotActuator[]; presets: IotCropPreset[]; onDone: () => void }) {
  const [actuatorId, setActuatorId] = useState(schedule?.actuator.id ?? actuators.find((a) => a.kind === 'pump')?.id ?? actuators[0]?.id ?? 0)
  const [time, setTime] = useState(schedule?.start_time ?? '05:30')
  const [minutes, setMinutes] = useState(String(schedule?.minutes ?? 30))
  const [everyDays, setEveryDays] = useState(schedule?.every_days ?? 1)
  const [months, setMonths] = useState<number[] | null>(schedule ? schedule.months : DRY_SEASON)
  const [skipRain, setSkipRain] = useState<number | null>(schedule ? schedule.skip_rain_mm : 10)
  const [note, setNote] = useState(schedule?.note ?? '')
  const [enabled, setEnabled] = useState(schedule?.enabled ?? true)
  const [errors, setErrors] = useState(NO_ERRORS)

  const toggleMonth = (m: number) => {
    const current = months ?? []
    const next = current.includes(m) ? current.filter((x) => x !== m) : [...current, m]
    setMonths(next.length === 0 || next.length === 12 ? null : next)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    try {
      const input = { start_time: time, minutes: Number(minutes) || 0, every_days: everyDays, months, skip_rain_mm: skipRain, note: note.trim() || null, enabled }
      if (schedule) await iotApi.updateSchedule(schedule.id, input)
      else await iotApi.createSchedule(actuatorId, input)
      onDone()
    } catch (err) {
      setErrors(toErrors(err))
    }
  }

  return (
    <section>
      <h1>{schedule ? 'Sửa lịch tưới' : 'Thêm lịch tưới'}</h1>
      {!schedule && presets.length > 0 && (
        <div className="card">
          <b>Gợi ý theo cây trồng</b>
          <div className="segmented wrap">
            {presets.map((p) => (
              <button
                key={p.code}
                type="button"
                onClick={() => {
                  if (!p.schedule) return
                  setEveryDays(p.schedule.every_days)
                  setMonths(p.schedule.months)
                  setNote(p.schedule.note.slice(0, 191))
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
          <p className="small muted">Điền chu kỳ và mùa tưới theo tài liệu kỹ thuật; số phút bơm tùy công suất bơm.</p>
        </div>
      )}
      <form className="form card" onSubmit={submit}>
        {!schedule && (
          <fieldset>
            <legend>Máy bơm / van</legend>
            <Choices value={actuatorId} options={actuators.map((a) => ({ value: a.id, label: a.name }))} onChange={setActuatorId} />
          </fieldset>
        )}
        <Field label="Giờ bắt đầu" error={errors.fields.start_time}>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
        </Field>
        <Field label="Chạy (phút)" error={errors.fields.minutes}>
          <input inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </Field>
        <fieldset>
          <legend>Lặp lại</legend>
          <Choices value={everyDays} options={[1, 2, 3, 7, 10, 15, 20, 25].map((n) => ({ value: n, label: n === 1 ? 'Mỗi ngày' : `${n} ngày/lần` }))} onChange={setEveryDays} />
        </fieldset>
        <fieldset>
          <legend>Tưới trong: {monthsLabel(months)}</legend>
          <div className="segmented wrap">
            <button type="button" className={JSON.stringify(months) === JSON.stringify(DRY_SEASON) ? 'active' : ''} onClick={() => setMonths(DRY_SEASON)}>
              Mùa khô (T12 → T4)
            </button>
            <button type="button" className={months === null ? 'active' : ''} onClick={() => setMonths(null)}>
              Cả năm
            </button>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <button key={m} type="button" className={months === null || months.includes(m) ? 'active' : ''} onClick={() => toggleMonth(m)}>
                T{m}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Bỏ lượt khi từ hôm qua tới giờ vườn đã mưa</legend>
          <Choices value={skipRain} options={[null, 5, 10, 20].map((mm) => ({ value: mm, label: mm === null ? 'Luôn tưới' : `≥ ${mm} mm` }))} onChange={setSkipRain} />
        </fieldset>
        <Field label="Ghi chú" error={errors.fields.note}>
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <fieldset>
          <legend>Trạng thái</legend>
          <Choices value={enabled} options={[{ value: true, label: 'Đang dùng' }, { value: false, label: 'Tạm tắt' }]} onChange={setEnabled} />
        </fieldset>
        <Message errors={errors} />
        <div className="btn-row">
          <button className="button primary">Lưu lịch tưới</button>
          <button type="button" onClick={onDone}>
            Quay lại
          </button>
        </div>
      </form>
      {schedule && <DeleteLink label="Xóa lịch tưới" confirmText={`Xóa lịch: ${describeSchedule(schedule)}?`} onConfirm={() => iotApi.deleteSchedule(schedule.id).then(onDone)} />}
    </section>
  )
}

// ---------- Lịch sử bật / tắt ----------

export function HistoryPage({ actuatorId, name, plotId }: { actuatorId: number; name: string; plotId: string | null }) {
  const [history, reload] = useAsync(() => iotApi.commandHistory(actuatorId), [actuatorId])
  return (
    <section>
      <Back to={plotId ? `cam-bien/lo/${plotId}` : 'cam-bien'} label="Quay lại" />
      <h1>🕘 Lịch sử · {name}</h1>
      <Status state={history} retry={reload} />
      {history.status === 'ok' && history.data.length === 0 && <p className="muted">Chưa bật / tắt lần nào.</p>}
      {history.status === 'ok' &&
        history.data.map((c) => {
          const bad = c.status === 'failed' || c.status === 'expired'
          return (
            <p key={c.id} className="card" style={{ borderLeft: `6px solid ${bad ? '#c0262d' : c.action === 'on' ? '#0b7a4b' : '#56675c'}` }}>
              <b>{describeCommand(c)}</b>
              {c.reason && (
                <>
                  <br />
                  <span className="small muted">{c.reason}</span>
                </>
              )}
              <br />
              <span className="small" style={bad ? { color: '#c0262d' } : undefined}>
                {timeAgo(c.created_at)} · {c.status_label}
                {c.message ? ` · ${c.message}` : ''}
              </span>
            </p>
          )
        })}
    </section>
  )
}

// ---------- Gửi file dữ liệu tải từ thiết bị ----------

export function UploadPage() {
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setResult(null)
    try {
      const content = await file.text()
      const info = parseDeviceFile(content)
      if (!info) throw new Error('File không phải dữ liệu của thiết bị Nhà Nông (dòng đầu phải là "#nhanong uid=…").')
      const res: IotIngestResult = await iotApi.uploadDeviceFile(content)
      setResult({ ok: true, text: `Thiết bị ${info.uid}: nhận ${res.accepted} số đo mới, ${res.duplicates} số đo đã có${res.rejected.length ? `, bỏ ${res.rejected.length} dòng lỗi` : ''}.` })
    } catch (err) {
      setResult({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <Back to="cam-bien" label="Cảm biến" />
      <h1>📥 Gửi file dữ liệu từ thiết bị</h1>
      <p className="muted">
        Ruộng không có mạng: bấm nút BOOT trên mạch, điện thoại vào WiFi "NHANONG-…", mở 192.168.4.1 tải file. Về nơi có mạng thì chọn file đó ở đây. Gửi lại cùng file không bị trùng.
      </p>
      <div className="card">
        <input type="file" accept=".csv,text/csv,text/plain" disabled={busy} onChange={(e) => void onFile(e.target.files?.[0])} />
        {busy && <p className="muted">Đang gửi…</p>}
        {result && <p className={result.ok ? '' : 'field-error'}>{result.text}</p>}
      </div>
    </section>
  )
}

// ---------- Gói đang dùng ----------

export function PlanCard() {
  const [me, reload] = useAsync(() => iotApi.me(), [])
  if (me.status !== 'ok') return null
  const plan = me.data.plan
  return (
    <div className="card">
      <b>⭐ {planLabel(plan)}</b>
      <p className="small muted">
        {plan.linked
          ? `Đã nối tài khoản Nhà Nông ${plan.phone ?? ''}: dùng chung gói trả phí.`
          : 'Đăng nhập tài khoản Nhà Nông (mục 👤 Tài khoản) trên trình duyệt này để dùng chung gói (xem lượng mưa 1 năm).'}
      </p>
      {plan.linked && (
        <button
          type="button"
          className="linklike"
          style={{ color: 'var(--error)' }}
          onClick={async () => {
            if (!window.confirm('Bỏ nối tài khoản Nhà Nông? Tài khoản cảm biến sẽ về gói miễn phí.')) return
            await iotApi.unlinkNhanong().catch(() => {})
            reload()
          }}
        >
          Bỏ nối tài khoản
        </button>
      )}
    </div>
  )
}

// ---------- Chia sẻ trang trại ----------

const SHARE_ROLES: { value: Exclude<IotRole, 'owner'>; label: string }[] = [
  { value: 'operator', label: ROLE_LABELS.operator },
  { value: 'viewer', label: ROLE_LABELS.viewer },
]

export function MembersPage({ farmId, farmName }: { farmId: number; farmName: string }) {
  const auth = useIotAuth()
  const [members, reload] = useAsync(() => iotApi.members(farmId), [farmId])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Exclude<IotRole, 'owner'>>('operator')
  const [errors, setErrors] = useState(NO_ERRORS)
  const [busy, setBusy] = useState(false)
  if (members.status !== 'ok') return <Status state={members} retry={reload} />
  const isOwner = members.data[0]?.user_id === auth?.user.id
  const me = members.data.find((m) => m.user_id === auth?.user.id)

  const invite = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErrors(NO_ERRORS)
    try {
      await iotApi.addMember(farmId, email.trim(), role)
      setEmail('')
      reload()
    } catch (err) {
      setErrors(toErrors(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <Back to="cam-bien" label="Cảm biến" />
      <h1>👥 Người dùng chung{farmName ? ` · ${farmName}` : ''}</h1>
      <p className="muted">Người được chia sẻ xem được số đo, thời tiết, lượng mưa và cũng nhận thông báo của trang trại. Chỉ chủ trang trại được thêm / sửa / xóa.</p>
      {members.data.map((m) => (
        <div key={m.user_id} className="card">
          <b>{m.name}</b> <span className="small muted">· {m.email}</span>
          <br />
          {isOwner && m.id !== null ? (
            <>
              <Choices value={m.role as Exclude<IotRole, 'owner'>} options={SHARE_ROLES} onChange={(r) => void iotApi.updateMember(m.id as number, r).then(reload)} />
              <button
                type="button"
                className="linklike"
                style={{ color: 'var(--error)' }}
                onClick={() => {
                  if (window.confirm(`Bỏ chia sẻ cho ${m.name}?`)) void iotApi.removeMember(m.id as number).then(reload)
                }}
              >
                Bỏ chia sẻ
              </button>
            </>
          ) : (
            <span className="small">{ROLE_LABELS[m.role]}</span>
          )}
        </div>
      ))}
      {isOwner && (
        <form className="form card" onSubmit={invite}>
          <b>＋ Chia sẻ cho người khác</b>
          <Field label="Email tài khoản cảm biến của người đó" error={errors.fields.email} hint="Người đó cần đăng ký tài khoản cảm biến trước (app Nhà Nông › 📡 Cảm biến).">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <fieldset>
            <legend>Quyền</legend>
            <Choices value={role} options={SHARE_ROLES} onChange={setRole} />
          </fieldset>
          <Message errors={errors} />
          <button className="button primary" disabled={busy}>
            {busy ? 'Đang chia sẻ…' : 'Chia sẻ'}
          </button>
        </form>
      )}
      {!isOwner && me?.id && (
        <DeleteLink
          label="Rời trang trại này"
          confirmText="Rời trang trại? Bạn sẽ không xem được và không nhận thông báo nữa."
          onConfirm={() => iotApi.removeMember(me.id as number).then(() => go('cam-bien'))}
        />
      )}
    </section>
  )
}

// ---------- Tải số liệu (Excel) ----------

export function ExportButton({ plotId }: { plotId: number }) {
  const [days, setDays] = useState(30)
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null })

  const download = async () => {
    setState({ busy: true, error: null })
    try {
      const { url, headers } = iotApi.exportRequest(plotId, days)
      const response = await fetch(url, { headers })
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.message ?? `Lỗi máy chủ (${response.status})`)
      const name = /filename="?([^";]+)"?/.exec(response.headers.get('content-disposition') ?? '')?.[1] ?? `so-do-${plotId}.xlsx`
      const link = document.createElement('a')
      link.href = URL.createObjectURL(await response.blob())
      link.download = name
      link.click()
      setTimeout(() => URL.revokeObjectURL(link.href), 10_000)
      setState({ busy: false, error: null })
    } catch (err) {
      setState({ busy: false, error: (err as Error).message })
    }
  }

  return (
    <span>
      <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Số ngày">
        {[7, 30, 90, 180].map((d) => (
          <option key={d} value={d}>
            {d} ngày
          </option>
        ))}
      </select>{' '}
      <button type="button" className="button" disabled={state.busy} onClick={() => void download()}>
        {state.busy ? 'Đang tải…' : '📊 Tải Excel'}
      </button>
      {state.error && <span className="field-error"> {state.error}</span>}
    </span>
  )
}
