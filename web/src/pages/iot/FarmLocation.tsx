import { nearestProvince, parseCoordinates, placeLabel, PROVINCE_CENTERS, PROVINCE_NAMES, type Place } from '@nhanong/shared'
import { lazy, Suspense, useCallback, useState, type KeyboardEvent } from 'react'
import { api } from '../../api'

const FarmLocationMap = lazy(() => import('./FarmLocationMap'))

type Point = { lat: number; lng: number }
export type FarmPlace = { province: string; point: Point | null }

/**
 * Vị trí trang trại khi không đứng tại vườn (VD con cái quản lý giúp cha mẹ):
 * tìm xã / phường / thôn, dán link Google Maps / tọa độ cha mẹ gửi qua Zalo, rồi bấm hoặc kéo ghim trên bản đồ cho đúng chỗ.
 * Vẫn dùng được vị trí hiện tại của máy khi đang đứng tại vườn. province là tên tỉnh (giống IotFarm.province).
 */
export function FarmLocation({ value, onChange }: { value: FarmPlace; onChange: (next: FarmPlace) => void }) {
  const { province, point } = value
  const provinceCode = Object.entries(PROVINCE_NAMES).find(([, n]) => n === province)?.[0] ?? ''
  const [query, setQuery] = useState('')
  const [places, setPlaces] = useState<Place[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [paste, setPaste] = useState('')
  const [label, setLabel] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  /**
   * Đặt vị trí. Tỉnh: lấy theo địa danh đã chọn; không có thì giữ tỉnh đang chọn khi chỉ chỉnh gần đó,
   * chưa chọn tỉnh hoặc dời sang vùng khác thì lấy tỉnh gần nhất.
   */
  const place = useCallback(
    (next: Point, from: string | null, provinceName?: string | null) => {
      const nearest = PROVINCE_NAMES[nearestProvince(next.lat, next.lng)] ?? ''
      const moved = !point || nearestProvince(point.lat, point.lng) !== nearestProvince(next.lat, next.lng)
      onChange({ point: next, province: provinceName || (province && !moved ? province : nearest) })
      setLabel(from)
    },
    [onChange, point, province],
  )

  const pickProvince = (code: string) => {
    const center = PROVINCE_CENTERS[code]
    // Đã có vị trí trong tỉnh khác thì đổi về trung tâm tỉnh mới (đủ cho dự báo thời tiết)
    const keep = point && code && nearestProvince(point.lat, point.lng) === code
    onChange({ province: PROVINCE_NAMES[code] ?? '', point: keep ? point : center ? { lat: center[0], lng: center[1] } : null })
    if (!keep) setLabel(center ? 'trung tâm tỉnh' : null)
  }

  const search = async () => {
    if (query.trim().length < 2) return setMessage('Gõ ít nhất 2 chữ, VD "Ea Tu" hoặc "thôn 5 Cư Bao".')
    setSearching(true)
    setMessage(null)
    try {
      const found = await api.places(query.trim(), provinceCode || null)
      setPlaces(found)
      if (found.length === 0) setMessage(`Không tìm thấy "${query.trim()}". Thử tên xã / phường, hoặc tên huyện cũ; rồi bấm trên bản đồ cho đúng chỗ vườn.`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Chưa tìm được địa danh. Hãy thử lại.')
    } finally {
      setSearching(false)
    }
  }

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    // Ô tìm nằm trong form trang trại: Enter để tìm, không gửi form
    if (e.key === 'Enter') {
      e.preventDefault()
      void search()
    }
  }

  const choose = (p: Place) => {
    place({ lat: p.lat, lng: p.lng }, placeLabel(p), (p.province && PROVINCE_NAMES[p.province]) || p.province_name)
    setPlaces(null)
    setQuery('')
    setMessage('Đã tới xã / thôn đã chọn. Bấm hoặc kéo 📍 trên bản đồ cho đúng chỗ vườn.')
  }

  const applyPaste = (text: string) => {
    setPaste(text)
    if (!text.trim()) return setMessage(null)
    const found = parseCoordinates(text)
    if (found) {
      place(found, 'vị trí đã dán')
      setMessage('Đã đọc được vị trí. Xem lại 📍 trên bản đồ.')
    } else {
      setMessage(
        /goo\.gl|maps\.app/.test(text)
          ? 'Link rút gọn chưa có tọa độ: mở link đó trên trình duyệt, đợi bản đồ hiện xong rồi chép lại link trên thanh địa chỉ.'
          : 'Chưa đọc được vị trí. Dán link Google Maps hoặc tọa độ dạng "12.8395, 108.2572".',
      )
    }
  }

  const locate = () => {
    if (!navigator.geolocation) return setMessage('Trình duyệt không lấy được vị trí. Hãy tìm xã / phường của vườn.')
    setMessage('Đang lấy vị trí…')
    navigator.geolocation.getCurrentPosition(
      (p) => {
        place({ lat: Math.round(p.coords.latitude * 1e5) / 1e5, lng: Math.round(p.coords.longitude * 1e5) / 1e5 }, 'vị trí hiện tại của máy')
        setMessage('Đã lấy vị trí hiện tại (chỉ đúng khi đang đứng tại vườn).')
      },
      () => setMessage('Không lấy được vị trí. Hãy tìm xã / phường của vườn, hoặc bấm trên bản đồ.'),
      { timeout: 15000 },
    )
  }

  return (
    <fieldset className="farm-location">
      <legend>📍 Vị trí vườn (để xem dự báo thời tiết, báo mưa)</legend>
      <label className="field">
        Tỉnh
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
      </label>

      <label className="field">
        Tìm xã / phường / thôn của vườn
        <span className="place-search">
          <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onSearchKey} maxLength={100} placeholder="VD: Ea Tu, Cư Bao, Tân Phú" />
          <button type="button" onClick={() => void search()} disabled={searching}>
            {searching ? 'Đang tìm…' : 'Tìm'}
          </button>
        </span>
      </label>
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

      <label className="field">
        Hoặc dán vị trí cha mẹ / người ở vườn gửi
        <input value={paste} onChange={(e) => applyPaste(e.target.value)} placeholder="Link Google Maps, vị trí Zalo, hoặc 12.8395, 108.2572" />
      </label>

      <button type="button" onClick={locate}>
        📡 Dùng vị trí hiện tại (khi đang ở vườn)
      </button>
      {message && <p className="small muted">{message}</p>}

      <Suspense fallback={<div className="shop-map farm-map" />}>
        <FarmLocationMap point={point} center={PROVINCE_CENTERS[provinceCode] ?? null} onPick={(p) => place(p, 'chỗ đã chọn trên bản đồ')} />
      </Suspense>
      <p className="small muted">
        {point ? `📍 ${label ? `${label[0].toUpperCase()}${label.slice(1)}: ` : ''}${point.lat}, ${point.lng}` : 'Chưa có vị trí'} · bấm vào bản đồ hoặc kéo 📍 để chỉnh
      </p>
    </fieldset>
  )
}
