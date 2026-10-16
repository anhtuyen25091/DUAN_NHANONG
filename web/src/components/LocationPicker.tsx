import { describeLocation, nearestProvince, placeLabel, provinceLocation, RADIUS_OPTIONS, type MyLocation, type Place } from '@nhanong/shared'
import { useState, type FormEvent } from 'react'
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

/**
 * Chọn tỉnh, rồi chọn chỗ ở để tìm cho đúng: tìm xã / phường / thôn (lấy tọa độ địa danh) hoặc dùng vị trí GPS.
 * Không chọn chỗ ở thì tìm quanh trung tâm tỉnh (ghi rõ để người dùng không tưởng là quanh nhà mình).
 */
export function LocationEditor({ onDone, canCancel }: { onDone?: () => void; canCancel?: boolean }) {
  const saved = useMyLocation()
  const [provinces] = useAsync(() => api.provinces(), [])
  const [province, setProvince] = useState(saved?.province ?? '')
  // Tọa độ thật: từ GPS hoặc địa danh đã chọn; null = trung tâm tỉnh
  const [point, setPoint] = useState<{ lat: number; lng: number; from: 'gps' | 'place' } | null>(saved?.gps ? { lat: saved.lat, lng: saved.lng, from: 'gps' } : null)
  const [label, setLabel] = useState(saved?.gps ? (saved.label ?? '') : '')
  const [query, setQuery] = useState('')
  const [places, setPlaces] = useState<Place[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [radius, setRadius] = useState(saved?.radius ?? 30)
  const [message, setMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const nameOf = (code: string) => (provinces.status === 'ok' ? (provinces.data.find((p) => p.code === code)?.name ?? null) : null)

  const locate = () => {
    if (!navigator.geolocation) return setMessage('Trình duyệt không hỗ trợ lấy vị trí. Hãy tìm xã / phường của bạn.')
    setMessage('Đang lấy vị trí…')
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const lat = Math.round(p.coords.latitude * 1e4) / 1e4
        const lng = Math.round(p.coords.longitude * 1e4) / 1e4
        setPoint({ lat, lng, from: 'gps' })
        setLabel('')
        setPlaces(null)
        if (!province) setProvince(nearestProvince(lat, lng))
        setMessage(null)
      },
      () =>
        setMessage(
          window.isSecureContext
            ? 'Không lấy được vị trí. Hãy cho phép trình duyệt dùng vị trí, hoặc tìm xã / phường của bạn.'
            : 'Trình duyệt chỉ cho lấy vị trí khi trang mở bằng https. Hãy tìm xã / phường của bạn.',
        ),
      { timeout: 15000, maximumAge: 300000 },
    )
  }

  const searchPlaces = async (e: FormEvent) => {
    e.preventDefault()
    if (query.trim().length < 2) return setMessage('Gõ ít nhất 2 chữ, ví dụ "Buôn Hồ".')
    setSearching(true)
    setMessage(null)
    try {
      const found = await api.places(query.trim(), province)
      setPlaces(found)
      if (found.length === 0) setMessage(`Không tìm thấy "${query.trim()}". Thử gõ tên xã / phường, hoặc tên huyện cũ.`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Chưa tìm được địa danh. Hãy thử lại.')
    } finally {
      setSearching(false)
    }
  }

  const choose = (place: Place) => {
    setPoint({ lat: place.lat, lng: place.lng, from: 'place' })
    setLabel(place.name)
    if (place.province) setProvince(place.province)
    setPlaces(null)
    setQuery('')
    setMessage(null)
  }

  const save = async () => {
    const location: MyLocation | null = point
      ? { province, province_name: nameOf(province), lat: point.lat, lng: point.lng, label: label.trim() || null, radius, gps: true }
      : provinceLocation(province, radius, nameOf(province))
    if (!location) return setMessage('Hãy chọn tỉnh.')
    setSaving(true)
    await setMyLocation(location)
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

      <fieldset>
        <legend>Chỗ ở (để tìm đúng quanh nhà bạn)</legend>
        <form className="place-search" onSubmit={searchPlaces}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} maxLength={100} placeholder="Gõ xã / phường / thôn, vd: Buôn Hồ" aria-label="Tìm xã, phường, thôn" />
          <button type="submit" disabled={searching}>
            {searching ? 'Đang tìm…' : 'Tìm'}
          </button>
        </form>
        {places && places.length > 0 && (
          <ul className="place-results">
            {places.map((p) => (
              <li key={`${p.name}|${p.lat}|${p.lng}`}>
                <button type="button" onClick={() => choose(p)}>
                  <b>{placeLabel(p)}</b>
                  {p.province_name && <span className="small muted"> · {p.province_name}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="actions">
          <button type="button" className={point?.from === 'gps' ? 'active-toggle' : ''} onClick={locate}>
            📍 {point?.from === 'gps' ? 'Đã lấy vị trí của tôi' : 'Hoặc dùng vị trí của máy'}
          </button>
        </div>
        {message && <p className="small muted">{message}</p>}
        {point ? (
          <div className="place-chosen">
            <span>
              ✓ Tìm quanh: <b>{label.trim() || 'vị trí của tôi'}</b>
              <span className="small muted">
                {' '}
                ({point.lat}, {point.lng})
              </span>
            </span>
            <button type="button" className="subtle-danger" onClick={() => (setPoint(null), setLabel(''))}>
              Bỏ chỗ ở
            </button>
          </div>
        ) : (
          province && <p className="notice">Chưa chọn chỗ ở: đang tìm quanh trung tâm tỉnh {nameOf(province) ?? ''}. Nhà bạn ở xa trung tâm thì hãy tìm xã / phường.</p>
        )}
        {point?.from === 'gps' && (
          <label>
            Đặt tên cho vị trí này (không bắt buộc)
            <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} placeholder="Ví dụ: Rẫy nhà" />
          </label>
        )}
      </fieldset>

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
