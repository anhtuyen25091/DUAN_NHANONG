import {
  ApiError,
  canControl,
  canManage,
  ROLE_LABELS,
  describeSchedule,
  formatDecimal,
  formatIotValue,
  thresholdLabel,
  timeAgo,
  weatherDayLabel,
  type IotActuator,
  type IotAlert,
  type IotFarm,
  type IotInterval,
  type IotRole,
  type IotPlotType,
  type IotReading,
  type IotWeather,
  type IotWorkKind,
} from '@nhanong/shared'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Status } from '../../components/Status'
import { href, useAsync } from '../../hooks'
import { useAuth } from '../../auth'
import { syncFarmWork, useFarmWorkVersion, WORK_ICONS } from '../../farmwork'
import { iotApi, sendIotCommand, setIotAuth, signOutIot, syncIotWithNhanong, useIotAuth } from '../../iot'
import { IotLineChart, RainBars } from './IotCharts'
import { PlotWork, WorkBadges, WorkBanners, WorkEventForm } from './IotWork'
import { ActuatorForm, DeviceForm, ExportButton, FarmForm, HistoryPage, MembersPage, PlanCard, PlotForm, RulesPage, SchedulesPage, ThresholdsPage, UploadPage } from './IotManage'

/**
 * Cảm biến ruộng / ao trên web: #/cam-bien (trang trại, thời tiết, cảnh báo), #/cam-bien/lo/{id} (số đo, điều khiển),
 * #/cam-bien/thoi-tiet/{farm} (7 ngày + lượng mưa), #/cam-bien/bieu-do?device=&metric= (lịch sử 1 chỉ số).
 * Thêm / sửa (trang trại, lô, thiết bị, ngưỡng, máy bơm, luật, lịch tưới, lịch sử, gửi file): IotManage.tsx.
 */
export default function IotRoutes({ path, query }: { path: string[]; query: URLSearchParams }) {
  const auth = useIotAuth()
  const nhanongToken = useAuth()?.token ?? null
  const [syncError, setSyncError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    syncIotWithNhanong()
      .then(() => setSyncError(null))
      .catch((err: Error) => setSyncError(err instanceof ApiError ? (Object.values(err.errors)[0]?.[0] ?? err.message) : err.message))
  }, [nhanongToken, attempt])
  if (!auth) return <SignIn signedIn={nhanongToken !== null} error={syncError} retry={() => {
          setSyncError(null)
          setAttempt((n) => n + 1)
        }} />
  if (path[1] === 'lo' && path[2]) return <PlotPage id={Number(path[2])} />
  if (path[1] === 'thoi-tiet' && path[2]) return <WeatherPage farmId={Number(path[2])} name={query.get('ten') ?? ''} />
  if (path[1] === 'bieu-do') return <ChartPage query={query} />
  const id = path[2] && path[2] !== 'moi' ? Number(path[2]) : null
  const num = (key: string) => (query.get(key) ? Number(query.get(key)) : null)
  const plotType = (query.get('type') ?? 'other') as IotPlotType
  // Người dùng chung (role khác owner) chỉ xem ngưỡng / luật / lịch tưới, không sửa
  const editable = canManage((query.get('role') ?? undefined) as IotRole | undefined)
  if (path[1] === 'trang-trai') return <FarmForm id={id} />
  if (path[1] === 'lo-moi') return <PlotForm id={null} farmId={num('farm')} />
  if (path[1] === 'sua-lo' && id) return <PlotForm id={id} farmId={null} />
  if (path[1] === 'thiet-bi') return <DeviceForm id={id} farmId={num('farm')} plotId={num('plot')} />
  if (path[1] === 'nguong' && id) return <ThresholdsPage plotId={id} plotName={query.get('ten') ?? ''} type={plotType} editable={editable} />
  if (path[1] === 'may' && num('plot')) return <ActuatorForm id={id} plotId={num('plot') ?? 0} />
  if (path[1] === 'luat' && id) return <RulesPage plotId={id} plotName={query.get('ten') ?? ''} type={plotType} editable={editable} />
  if (path[1] === 'lich' && id) return <SchedulesPage plotId={id} plotName={query.get('ten') ?? ''} editable={editable} />
  if (path[1] === 'lich-su' && id) return <HistoryPage actuatorId={id} name={query.get('ten') ?? ''} plotId={query.get('plot')} />
  if (path[1] === 'gui-file') return <UploadPage />
  if (path[1] === 'viec' && num('plot')) return <WorkEventForm key={path[2]} id={id} plotId={num('plot') ?? 0} kind={(query.get('kind') ?? 'spray') as IotWorkKind} />
  if (path[1] === 'chia-se' && id) return <MembersPage farmId={id} farmName={query.get('ten') ?? ''} />
  return <Home />
}

function Back({ to = 'cam-bien', label = 'Cảm biến' }: { to?: string; label?: string }) {
  return (
    <a className="back" href={href(to)}>
      ‹ {label}
    </a>
  )
}

/** Đăng nhập Nhà Nông là vào được Cảm biến; tài khoản cảm biến cũ (email) đăng nhập riêng khi chưa có tài khoản Nhà Nông */
function SignIn({ signedIn, error, retry }: { signedIn: boolean; error: string | null; retry: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setFormError(null)
    try {
      setIotAuth(await iotApi.login(email.trim(), password))
    } catch (err) {
      setFormError(err instanceof ApiError ? (Object.values(err.errors)[0]?.[0] ?? err.message) : (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h1>📡 Cảm biến ruộng · ao</h1>
      <p className="muted">Xem độ ẩm, pH, độ mặn, mực nước, oxy trong ao… do thiết bị gửi về; bật / tắt máy bơm, quạt oxy; dự báo thời tiết và lượng mưa tại vườn.</p>
      {signedIn ? (
        <div className="card">
          {error ? (
            <>
              <p className="field-error">{error}</p>
              <button type="button" className="button primary" onClick={retry}>
                Thử lại
              </button>
            </>
          ) : (
            <p className="muted">Đang vào mục Cảm biến bằng tài khoản Nhà Nông…</p>
          )}
        </div>
      ) : (
        <>
          <div className="card">
            <p>Dùng chung tài khoản Nhà Nông: đăng nhập là vào được mục Cảm biến.</p>
            <a className="button primary" href={href('tai-khoan')}>
              Đăng nhập / đăng ký Nhà Nông
            </a>
          </div>
          <details className="card">
            <summary>Đã có tài khoản cảm biến cũ (đăng nhập bằng email)</summary>
            <form className="form" onSubmit={submit}>
              <label className="field">
                Email
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
              </label>
              <label className="field">
                Mật khẩu
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </label>
              {formError && <p className="field-error">{formError}</p>}
              <button className="button" disabled={busy}>
                {busy ? 'Đang gửi…' : 'Đăng nhập'}
              </button>
              <p className="small muted">Lần sau đăng nhập Nhà Nông thì tài khoản này tự nối vào, giữ nguyên trang trại.</p>
            </form>
          </details>
        </>
      )}
    </section>
  )
}

function Home() {
  const auth = useIotAuth()
  const version = useFarmWorkVersion()
  const [farms, reloadFarms] = useAsync(() => iotApi.farms(), [version])
  useEffect(() => {
    void syncFarmWork()
  }, [])
  const [alerts, reloadAlerts] = useAsync(() => iotApi.alerts(true), [])

  return (
    <section>
      <h1>📡 Cảm biến ruộng · ao</h1>
      {alerts.status === 'ok' && alerts.data.length > 0 && (
        <>
          <h2 className="section-title">⚠️ {alerts.data.length} cảnh báo đang mở</h2>
          {alerts.data.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              canResolve={canControl(farms.status === 'ok' ? farms.data.find((f) => f.id === alert.plot.farm_id)?.role : undefined)}
              onResolved={reloadAlerts}
            />
          ))}
        </>
      )}
      <Status state={farms} retry={reloadFarms} />
      {farms.status === 'ok' && farms.data.length === 0 && <p className="notice">Chưa có trang trại nào. Bấm "＋ Thêm trang trại" để bắt đầu.</p>}
      {farms.status === 'ok' &&
        farms.data.map((farm) => (
          <div key={farm.id}>
            <h2 className="section-title">
              {farm.name}
              {farm.province ? ` · ${farm.province}` : ''}{' '}
              {canManage(farm.role) && (
                <a className="small" href={href(`cam-bien/trang-trai/${farm.id}`)}>
                  Sửa
                </a>
              )}{' '}
              <a className="small" href={href(`cam-bien/chia-se/${farm.id}`, { ten: farm.name })}>
                👥 {canManage(farm.role) ? 'Chia sẻ' : 'Người dùng chung'}
              </a>
            </h2>
            {!canManage(farm.role) && (
              <p className="small muted">
                👥 {farm.owner_name} chia sẻ cho bạn · {ROLE_LABELS[farm.role]}
              </p>
            )}
            <WeatherCard farm={farm} />
            {farm.plots.map((plot) => (
              <a key={plot.id} className="card local-banner" href={href(`cam-bien/lo/${plot.id}`)}>
                <span>
                  <b>
                    {plot.type === 'pond' ? '🦐' : plot.type === 'field' ? '🌾' : plot.type === 'greenhouse' ? '🏠' : '🌳'} {plot.name}
                  </b>
                  <br />
                  <span className="small muted">
                    {plot.type_label}
                    {plot.crop ? ` · ${plot.crop}` : ''}
                  </span>
                  <WorkBadges plot={plot} />
                </span>
                <span aria-hidden>›</span>
              </a>
            ))}
            {canManage(farm.role) && (
              <div className="btn-row">
                <a className="button" href={href('cam-bien/lo-moi', { farm: String(farm.id) })}>
                  ＋ Thêm lô
                </a>
                <a className="button" href={href('cam-bien/thiet-bi/moi', { farm: String(farm.id) })}>
                  ＋ Thêm thiết bị đo
                </a>
              </div>
            )}
          </div>
        ))}
      <div className="btn-row">
        <a className="button primary" href={href('cam-bien/trang-trai/moi')}>
          ＋ Thêm trang trại
        </a>
        <a className="button" href={href('cam-bien/gui-file')}>
          📥 Gửi file dữ liệu
        </a>
      </div>
      <PlanCard />
      <p className="small muted center">
        {auth?.user.nhanong_user_id ? (
          <>Dùng tài khoản Nhà Nông {auth.user.phone ?? auth.user.email}</>
        ) : (
          <>
            Đăng nhập: {auth?.user.email} ·{' '}
            <button type="button" className="linklike" onClick={() => void signOutIot()}>
              Đăng xuất
            </button>
          </>
        )}
      </p>
    </section>
  )
}

function rainText(data: IotWeather): string {
  const { rain_mm, rain_chance } = data.next_24h
  return rain_mm < 0.5 ? '24 giờ tới: hầu như không mưa' : `24 giờ tới: mưa khoảng ${formatDecimal(rain_mm)} mm (khả năng ${rain_chance}%)`
}

function Hints({ hints }: { hints: string[] }) {
  return (
    <>
      {hints.map((hint) => (
        <p key={hint} className="notice small">
          💡 {hint}
        </p>
      ))}
    </>
  )
}

function WeatherCard({ farm }: { farm: IotFarm }) {
  const hasLocation = farm.lat !== null && farm.lng !== null
  const [weather] = useAsync(() => (hasLocation ? iotApi.weather(farm.id) : Promise.resolve(null)), [farm.id])
  if (!hasLocation) return <p className="muted small">🌦️ Trang trại chưa có vị trí (bấm Sửa để chọn) nên chưa có dự báo.</p>
  if (weather.status === 'error') return <p className="muted small">🌦️ {weather.error.message}</p>
  if (weather.status !== 'ok' || !weather.data) return null
  const today = weather.data.daily[0]
  return (
    <a className="card local-banner" href={href(`cam-bien/thoi-tiet/${farm.id}`, { ten: farm.name })} style={{ background: '#eef6fb' }}>
      <span>
        <b>
          {today.icon} Hôm nay: {today.label}, {formatDecimal(today.temp_min)}–{formatDecimal(today.temp_max)}°C
        </b>
        <br />
        <span className="small muted">{rainText(weather.data)}</span>
        {farm.raining && (
          <>
            <br />
            <b style={{ color: '#2b7bb9' }}>
              🌧️ Đang mưa từ {timeAgo(farm.raining.since)}
              {farm.raining.mm >= 0.5 ? `, khoảng ${formatDecimal(farm.raining.mm)} mm` : ''}
            </b>
          </>
        )}
        {farm.dry_days !== null && farm.dry_days >= 3 && !farm.raining && (
          <>
            <br />
            <b style={{ color: '#7a4a00' }}>☀️ Đã {farm.dry_days} ngày không mưa</b>
          </>
        )}
        <Hints hints={weather.data.hints} />
      </span>
      <span aria-hidden>›</span>
    </a>
  )
}

function AlertCard({ alert, canResolve = true, onResolved }: { alert: IotAlert; canResolve?: boolean; onResolved: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const limit = alert.direction === 'below' ? `thấp hơn ${formatIotValue(alert.min ?? 0, alert.metric.unit)}` : `cao hơn ${formatIotValue(alert.max ?? 0, alert.metric.unit)}`
  return (
    <div className="card" style={{ borderLeft: '6px solid #c0262d' }}>
      <b>
        {alert.plot.name}: {alert.metric.name} {formatIotValue(alert.value, alert.metric.unit)}
      </b>
      <p className="small muted">
        {limit} · {timeAgo(alert.measured_at)} · {alert.device.name}
      </p>
      {alert.note && <p className="small muted">🌱 {alert.note}</p>}
      {canResolve && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError(null)
            try {
              await iotApi.resolveAlert(alert.id)
              onResolved()
            } catch (err) {
              setError((err as Error).message)
            } finally {
              setBusy(false)
            }
          }}
        >
          ✓ Đã xử lý
        </button>
      )}
      {error && <p className="field-error">{error}</p>}
    </div>
  )
}

function PlotPage({ id }: { id: number }) {
  const version = useFarmWorkVersion()
  const [summary, reload] = useAsync(() => iotApi.plotSummary(id), [id, version])
  useEffect(() => {
    void syncFarmWork()
  }, [id])
  const data = summary.status === 'ok' ? summary.data : null
  return (
    <section>
      <Back />
      <h1>{data?.plot.name ?? 'Lô'}</h1>
      <Status state={summary} retry={reload} />
      {data && (
        <>
          <WorkBanners work={data.plot.work} />
          {data.open_alerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} canResolve={canControl(data.role)} onResolved={reload} />
          ))}
          <h2 className="section-title">Số đo mới nhất</h2>
          {data.readings.length === 0 && <p className="muted">Chưa có số đo.</p>}
          <div className="iot-tiles">
            {data.readings.map((reading) => (
              <ReadingTile key={`${reading.device_id}-${reading.metric.code}`} reading={reading} plotId={id} showDevice={data.devices.length > 1} />
            ))}
          </div>
          <div className="btn-row">
            <a className="button" href={href(`cam-bien/nguong/${id}`, { ten: data.plot.name, type: data.plot.type, role: data.role })}>
              🎯 Ngưỡng cảnh báo
            </a>
            {canManage(data.role) && (
              <a className="button" href={href(`cam-bien/sua-lo/${id}`)}>
                ✏️ Sửa lô
              </a>
            )}
            <ExportButton plotId={id} />
          </div>
          <Controls plotId={id} plotName={data.plot.name} type={data.plot.type} role={data.role} />
          <PlotWork plot={data.plot} role={data.role} onChanged={reload} />
          <h2 className="section-title">Thiết bị đo</h2>
          {data.devices.map((device) => (
            <a key={device.id} className="card" style={{ display: 'block' }} href={canManage(data.role) ? href(`cam-bien/thiet-bi/${device.id}`) : undefined}>
              <span style={{ color: device.online ? '#0b7a4b' : '#c0262d' }}>●</span> <b>{device.name}</b>{' '}
              <span className="small muted">
                · {device.kind === 'lorawan' ? 'LoRaWAN' : 'WiFi / 4G'} · mã {device.uid}
                {device.battery !== null ? ` · pin ${device.battery}%` : ''} · {device.last_seen_at ? `gửi lần cuối ${timeAgo(device.last_seen_at)}` : 'chưa gửi lần nào'}
              </span>
            </a>
          ))}
          {canManage(data.role) && (
            <a className="button" href={href('cam-bien/thiet-bi/moi', { farm: String(data.plot.farm_id), plot: String(id) })}>
              ＋ Thêm thiết bị đo
            </a>
          )}
        </>
      )}
    </section>
  )
}

function ReadingTile({ reading, plotId, showDevice }: { reading: IotReading; plotId: number; showDevice: boolean }) {
  const bad = reading.status === 'below' || reading.status === 'above'
  const limit = thresholdLabel(reading.min, reading.max)
  return (
    <a
      className={`card iot-tile${bad ? ' bad' : ''}`}
      href={href('cam-bien/bieu-do', {
        device: String(reading.device_id),
        plot: String(plotId),
        metric: reading.metric.code,
        ten: reading.metric.name,
        unit: reading.metric.unit ?? '',
        min: reading.min === null ? '' : String(reading.min),
        max: reading.max === null ? '' : String(reading.max),
      })}
    >
      <span className="small muted">{reading.metric.name}</span>
      <span className="iot-value">{formatIotValue(reading.value, reading.metric.unit)}</span>
      {limit && <span className="small">{bad ? `⚠️ ${limit}` : `✓ ${limit}`}</span>}
      <span className="small muted">
        {timeAgo(reading.measured_at)}
        {showDevice ? ` · ${reading.device_name}` : ''}
      </span>
    </a>
  )
}

function Controls({ plotId, plotName, type, role }: { plotId: number; plotName: string; type: IotPlotType; role: IotRole }) {
  const [actuators, reload] = useAsync(() => iotApi.actuators(plotId), [plotId])
  // Giữ danh sách cũ trong lúc tải lại (tránh nhấp nháy khi hỏi trạng thái mỗi 3 giây)
  const [last, setLast] = useState<IotActuator[] | null>(null)
  if (actuators.status === 'ok' && actuators.data !== last) setLast(actuators.data)
  const list = last ?? []
  const reloadRef = useRef(reload)
  useEffect(() => {
    reloadRef.current = reload
  })
  const waiting = list.some((a) => a.pending !== null)
  // Đang chờ mạch nhận lệnh: tải lại mỗi 3 giây
  useEffect(() => {
    if (!waiting) return
    const timer = setInterval(() => reloadRef.current(), 3000)
    return () => clearInterval(timer)
  }, [waiting])
  return (
    <>
      {(list.length > 0 || canManage(role)) && <h2 className="section-title">⚙️ Điều khiển</h2>}
      {list.map((actuator) => (
        <ActuatorCard key={actuator.id} actuator={actuator} plotId={plotId} role={role} onChanged={() => reloadRef.current()} />
      ))}
      {(canManage(role) || list.length > 0) && (
        <div className="btn-row">
          {canManage(role) && (
            <a className="button" href={href('cam-bien/may/moi', { plot: String(plotId) })}>
              ＋ Thêm máy bơm / quạt
            </a>
          )}
          {list.length > 0 && (
            <a className="button" href={href(`cam-bien/luat/${plotId}`, { ten: plotName, type, role })}>
              ⚡ Luật tự động
            </a>
          )}
        </div>
      )}
      {list.length > 0 && <Schedules plotId={plotId} plotName={plotName} editable={canManage(role)} />}
    </>
  )
}

function ActuatorCard({ actuator, plotId, role, onChanged }: { actuator: IotActuator; plotId: number; role: IotRole; onChanged: () => void }) {
  const [minutes, setMinutes] = useState(Math.min(30, actuator.max_minutes))
  const [error, setError] = useState<string | null>(null)
  const pending = actuator.pending
  const send = async (action: 'on' | 'off') => {
    setError(null)
    try {
      // Lô vừa phun thuốc: máy tưới trên tán đang tạm dừng thì hỏi "Vẫn bật?"
      await sendIotCommand(actuator.id, action, action === 'on' ? minutes : undefined)
      onChanged()
    } catch (err) {
      setError((err as Error).message)
    }
  }
  const timeOf = (iso: string) => {
    const d = new Date(iso)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  return (
    <div className="card" style={actuator.is_on ? { border: '2px solid #0b7a4b' } : undefined}>
      <b>{actuator.name}</b>{' '}
      <span className="small muted">
        · {actuator.kind_label}
        {actuator.irrigation_mode === 'root' ? ' · tưới gốc' : actuator.wets_canopy ? ' · tưới trên tán' : ''} · {actuator.device_name}, kênh {actuator.channel}
      </span>
      <p>
        {pending
          ? `⏳ Đang gửi lệnh ${pending.action === 'on' ? `bật ${pending.minutes} phút` : 'tắt'}… (mạch nhận trong vài giây)`
          : actuator.is_on
            ? `🟢 Đang chạy${actuator.auto_off_at ? `, tự tắt lúc ${timeOf(actuator.auto_off_at)}` : ''}`
            : '⚪ Đang tắt'}
      </p>
      {actuator.block && (
        <p className="small muted">
          🔒 Khóa an toàn: không bơm khi {actuator.block.metric_name} {actuator.block.operator === 'above' ? '>' : '<'} {formatDecimal(actuator.block.value)}
          {actuator.block.unit ? ` ${actuator.block.unit}` : ''} ({actuator.block.device_name})
        </p>
      )}
      {!actuator.device_online && <p className="field-error">⚠️ Mạch điều khiển đang mất kết nối: lệnh sẽ hủy nếu 10 phút không nhận được.</p>}
      {canControl(role) && (
        <>
          <div className="segmented">
            {[15, 30, 60]
              .filter((m) => m <= actuator.max_minutes)
              .map((m) => (
                <button key={m} type="button" className={minutes === m ? 'active' : ''} onClick={() => setMinutes(m)}>
                  {m} phút
                </button>
              ))}
          </div>
          <div className="btn-row">
            <button type="button" className="button primary" onClick={() => send('on')}>
              Bật {minutes} phút
            </button>
            <button type="button" onClick={() => send('off')} disabled={!actuator.is_on && pending?.action !== 'on'}>
              Tắt
            </button>
          </div>
        </>
      )}
      {error && <p className="field-error">{error}</p>}
      <p className="small">
        <a href={href(`cam-bien/lich-su/${actuator.id}`, { ten: actuator.name, plot: String(plotId) })}>🕘 Lịch sử bật / tắt</a>
        {canManage(role) && (
          <>
            {' · '}
            <a href={href(`cam-bien/may/${actuator.id}`, { plot: String(plotId) })}>Sửa</a>
          </>
        )}
      </p>
    </div>
  )
}

/** Lịch tưới của lô (thêm / sửa ở trang Lịch tưới) */
function Schedules({ plotId, plotName, editable }: { plotId: number; plotName: string; editable: boolean }) {
  const [schedules] = useAsync(() => iotApi.schedules(plotId), [plotId])
  if (schedules.status !== 'ok' || (!editable && schedules.data.length === 0)) return null
  return (
    <>
      <h2 className="section-title">
        🗓️ Lịch tưới{' '}
        {editable && (
          <a className="small" href={href(`cam-bien/lich/${plotId}`, { ten: plotName })}>
            {schedules.data.length ? 'Sửa' : '＋ Thêm'}
          </a>
        )}
      </h2>
      {schedules.data.map((schedule) => (
        <p key={schedule.id} className="card" style={schedule.enabled ? undefined : { opacity: 0.6 }}>
          <b>{schedule.actuator.name}</b>: {describeSchedule(schedule)}
          <br />
          <span className="small muted">
            {schedule.enabled ? `Lượt tới: ${schedule.next_run_on.split('-').reverse().slice(0, 2).join('/')}` : 'Đang tạm tắt'}
            {schedule.note ? ` · ${schedule.note}` : ''}
          </span>
        </p>
      ))}
    </>
  )
}

const RANGES: { label: string; hours: number; interval: IotInterval }[] = [
  { label: '24 giờ', hours: 24, interval: 'raw' },
  { label: '7 ngày', hours: 24 * 7, interval: 'hour' },
  { label: '30 ngày', hours: 24 * 30, interval: 'day' },
]

function ChartPage({ query }: { query: URLSearchParams }) {
  const [range, setRange] = useState(RANGES[0])
  const device = Number(query.get('device'))
  const metric = query.get('metric') ?? ''
  const plotId = Number(query.get('plot')) || null
  const [history, reload] = useAsync(
    () => iotApi.readings(device, { metric, from: new Date(Date.now() - range.hours * 3600 * 1000).toISOString(), interval: range.interval }),
    [device, metric, range],
  )
  // Việc làm vườn trong khoảng đang xem: vạch đánh dấu trên biểu đồ (không có cũng không sao)
  const [events] = useAsync(() => {
    if (!plotId) return Promise.resolve([])
    const from = new Date(Date.now() - range.hours * 3600 * 1000)
    const day = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`
    return iotApi.plotEvents(plotId, { from: day }).catch(() => [])
  }, [plotId, range])
  const markers =
    events.status === 'ok'
      ? events.data.filter((e) => !e.planned).map((e) => ({ t: e.done_at, icon: WORK_ICONS[e.kind], label: `${e.kind_label}: ${e.title}`, title: e.title, faint: e.kind === 'water' }))
      : []
  const toNumber = (v: string | null) => (v ? Number(v) : null)
  return (
    <section>
      <Back />
      <h1>{query.get('ten') ?? 'Biểu đồ'}</h1>
      <div className="segmented tabs">
        {RANGES.map((r) => (
          <button key={r.label} type="button" className={r === range ? 'active' : ''} onClick={() => setRange(r)}>
            {r.label}
          </button>
        ))}
      </div>
      <Status state={history} retry={reload} />
      {history.status === 'ok' && (
        <div className="card">
          <IotLineChart points={history.data.data} unit={query.get('unit') || null} min={toNumber(query.get('min'))} max={toNumber(query.get('max'))} daily={history.data.interval === 'day'} markers={markers} />
        </div>
      )}
    </section>
  )
}

function WeatherPage({ farmId, name }: { farmId: number; name: string }) {
  const [weather, reload] = useAsync(() => iotApi.weather(farmId), [farmId])
  // Link không kèm tên (mở từ thông báo cũ, chép link): lấy tên trang trại cho tiêu đề
  const [farmName] = useAsync(async () => name || ((await iotApi.farms()).find((f) => f.id === farmId)?.name ?? ''), [farmId, name])
  const title = farmName.status === 'ok' && farmName.data ? farmName.data : name
  return (
    <section>
      <Back />
      <h1>🌦️ Thời tiết{title ? ` · ${title}` : ''}</h1>
      <Status state={weather} retry={reload} />
      {weather.status === 'ok' && (
        <>
          <div className="card">
            <b>{rainText(weather.data)}</b>
            <Hints hints={weather.data.hints} />
          </div>
          <div className="card table-wrap">
            <table className="trade-table">
              <tbody>
                {weather.data.daily.map((day, index) => (
                  <tr key={day.date}>
                    <td>
                      <b>{weatherDayLabel(day.date, index)}</b>
                    </td>
                    <td>
                      {day.icon} {day.label}
                    </td>
                    <td className="nowrap">
                      {formatDecimal(day.temp_min)}–{formatDecimal(day.temp_max)}°C
                    </td>
                    <td className="nowrap">
                      {day.rain_mm >= 0.5 ? `${formatDecimal(day.rain_mm)} mm` : '—'}
                      {day.rain_chance ? ` · ${day.rain_chance}%` : ''}
                    </td>
                    <td className="nowrap small muted">gió {formatDecimal(day.wind_max)} m/s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <RainHistory farmId={farmId} />
      <p className="small muted center">Nguồn dữ liệu thời tiết: Open-Meteo (ước tính theo vị trí, cập nhật mỗi giờ).</p>
    </section>
  )
}

function RainHistory({ farmId }: { farmId: number }) {
  const [days, setDays] = useState(30)
  const [rainfall, reload] = useAsync(() => iotApi.rainfall(farmId, days), [farmId, days])
  return (
    <div className="card">
      <h2 className="section-title">🌧️ Lượng mưa tại vườn</h2>
      <div className="segmented">
        {[7, 30, 90, 365].map((n) => (
          <button key={n} type="button" className={n === days ? 'active' : ''} onClick={() => setDays(n)}>
            {n === 365 ? '1 năm' : `${n} ngày`}
          </button>
        ))}
      </div>
      <Status state={rainfall} retry={reload} />
      {rainfall.status === 'ok' && (
        <>
          <p>
            Tổng <b>{formatDecimal(rainfall.data.total_mm)} mm</b> · <b>{rainfall.data.rainy_days}</b>/{rainfall.data.days} ngày có mưa
          </p>
          <RainBars data={rainfall.data} />
          {rainfall.data.locked && (
            <p className="notice">
              🔒 Tài khoản miễn phí chỉ xem được {rainfall.data.max_days} ngày gần nhất. Có gói Nhà Nông thì xem lượng mưa 1 năm
              {rainfall.data.plan.linked ? '.' : ' (đăng nhập tài khoản Nhà Nông trên trình duyệt này để dùng chung gói).'} <a href={href('tai-khoan')}>Xem gói</a>
            </p>
          )}
        </>
      )}
    </div>
  )
}
