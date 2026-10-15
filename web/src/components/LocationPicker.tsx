import { describeLocation, nearestProvince, provinceLocation, RADIUS_OPTIONS, type MyLocation } from '@nhanong/shared'
import { useState } from 'react'
import { api } from '../api'
import { useAsync } from '../hooks'
import { setMyLocation, useMyLocation } from '../myLocation'

/** Dòng "📍 Khu vực của tôi: … · Đổi"; chưa chọn thì hiện luôn ô chọn */
export function LocationBar({ title = 'Khu vực của tôi' }: { title?: string }) {
  const location = useMyLocation()
  const [editing, setEditing] = useState(false)
  if (!location || editing) return <LocationEditor onDone={() => setEditing(false)} canCancel={!!location} />
  return (
    <div className="card location-bar">
      <span>
        <span className="small muted">📍 {title}</span>
        <br />
        <b>{describeLocation(location)}</b>
      </span>
      <button type="button" onClick={() => setEditing(true)}>
        Đổi
      </button>
    </div>
  )
}

/** Chọn tỉnh, lấy vị trí GPS (nếu trình duyệt cho), đặt tên chỗ ở và bán kính */
export function LocationEditor({ onDone, canCancel }: { onDone?: () => void; canCancel?: boolean }) {
  const saved = useMyLocation()
  const [provinces] = useAsync(() => api.provinces(), [])
  const [province, setProvince] = useState(saved?.province ?? '')
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(saved?.gps ? { lat: saved.lat, lng: saved.lng } : null)
  const [label, setLabel] = useState(saved?.label ?? '')
  const [radius, setRadius] = useState(saved?.radius ?? 30)
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const nameOf = (code: string) => (provinces.status === 'ok' ? (provinces.data.find((p) => p.code === code)?.name ?? null) : null)

  const locate = () => {
    if (!navigator.geolocation) return setMessage('Trình duyệt không hỗ trợ lấy vị trí. Hãy chọn tỉnh.')
    setMessage('Đang lấy vị trí…')
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const point = { lat: Math.round(p.coords.latitude * 1e4) / 1e4, lng: Math.round(p.coords.longitude * 1e4) / 1e4 }
        setGps(point)
        if (!province) setProvince(nearestProvince(point.lat, point.lng))
        setMessage(null)
      },
      () =>
        setMessage(
          window.isSecureContext
            ? 'Không lấy được vị trí. Hãy cho phép trình duyệt dùng vị trí, hoặc chỉ chọn tỉnh.'
            : 'Trình duyệt chỉ cho lấy vị trí khi trang mở bằng https. Hãy chọn tỉnh (giá sẽ tính quanh trung tâm tỉnh).',
        ),
      { timeout: 15000, maximumAge: 300000 },
    )
  }

  const save = async () => {
    const base = gps
      ? ({ province, province_name: nameOf(province), lat: gps.lat, lng: gps.lng, label: label.trim() || null, radius, gps: true } satisfies MyLocation)
      : provinceLocation(province, radius, nameOf(province))
    if (!base) return setMessage('Hãy chọn tỉnh.')
    setSaving(true)
    await setMyLocation(gps ? base : { ...base, label: label.trim() || null })
    setSaving(false)
    onDone?.()
  }

  return (
    <section className="card form location-editor">
      <h2>📍 Bạn ở khu vực nào?</h2>
      <p className="small muted">Để gợi ý giá các điểm mua quanh bạn và dịch vụ gần đó.</p>
      <label>
        Tỉnh / thành
        <select value={province} onChange={(e) => setProvince(e.target.value)}>
          <option value="">Chọn tỉnh / thành</option>
          {provinces.status === 'ok' &&
            provinces.data.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
        </select>
      </label>
      <div className="actions">
        <button type="button" className={gps ? 'active-toggle' : ''} onClick={locate}>
          📍 {gps ? 'Đã lấy vị trí của tôi' : 'Dùng vị trí của tôi'}
        </button>
        {gps && (
          <button type="button" className="subtle-danger" onClick={() => setGps(null)}>
            Bỏ vị trí (dùng trung tâm tỉnh)
          </button>
        )}
      </div>
      {gps && <p className="small muted">Tọa độ: {gps.lat}, {gps.lng}</p>}
      {message && <p className="small muted">{message}</p>}
      <label>
        Tên chỗ ở (không bắt buộc)
        <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} placeholder="Ví dụ: Xã Hòa Thuận" />
      </label>
      <fieldset>
        <legend>Tìm trong bán kính</legend>
        <div className="segmented">
          {RADIUS_OPTIONS.map((r) => (
            <button key={r} type="button" className={r === radius ? 'active' : ''} aria-pressed={r === radius} onClick={() => setRadius(r)}>
              {r} km
            </button>
          ))}
        </div>
      </fieldset>
      <div className="actions">
        <button type="button" className="primary" disabled={!province || saving} onClick={save}>
          {saving ? 'Đang lưu…' : 'Lưu khu vực'}
        </button>
        {canCancel && (
          <button type="button" onClick={onDone}>
            Thôi
          </button>
        )}
      </div>
    </section>
  )
}
