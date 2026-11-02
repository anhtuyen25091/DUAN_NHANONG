import { MAP_MAX_ZOOM, VIETNAM_CENTER } from '@nhanong/shared'
import L from 'leaflet'
import { useEffect, useRef, useState } from 'react'
import { createVietnamMap } from '../../vietnamMap'

type Point = { lat: number; lng: number }

/** Ghim vị trí vườn (vẽ bằng CSS, không cần ảnh marker của Leaflet) */
const PIN = L.divIcon({ className: 'farm-pin', html: '<span>📍</span>', iconSize: [36, 36], iconAnchor: [18, 34] })

/**
 * Bản đồ nhỏ để chỉnh chỗ vườn: bấm vào bản đồ hoặc kéo ghim. Đã có vị trí thì phóng tới mức xã;
 * chưa có thì xem cả tỉnh (hoặc cả nước).
 */
export default function FarmLocationMap({ point, center, onPick }: { point: Point | null; center: [number, number] | null; onPick: (point: Point) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const pin = useRef<L.Marker | null>(null)
  const pick = useRef(onPick)
  const [hint, setHint] = useState<string | null>(null)
  const hintTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    pick.current = onPick
  }, [onPick])

  useEffect(() => {
    if (!box.current) return
    const m = createVietnamMap(box.current, (text) => {
      setHint(text)
      clearTimeout(hintTimer.current)
      hintTimer.current = setTimeout(() => setHint(null), 1500)
    })
    const round = (ll: L.LatLng) => ({ lat: Math.round(ll.lat * 1e5) / 1e5, lng: Math.round(ll.lng * 1e5) / 1e5 })
    m.on('click', (e: L.LeafletMouseEvent) => pick.current(round(e.latlng)))
    pin.current = L.marker(VIETNAM_CENTER, { icon: PIN, draggable: true, keyboard: false }).on('dragend', (e) => pick.current(round((e.target as L.Marker).getLatLng())))
    map.current = m
    return () => {
      clearTimeout(hintTimer.current)
      m.remove()
      map.current = null
    }
  }, [])

  useEffect(() => {
    const m = map.current
    if (!m || !pin.current) return
    if (point) {
      pin.current.setLatLng([point.lat, point.lng]).addTo(m)
      // Vừa bấm / kéo ghim trong khung đang xem thì giữ nguyên khung; vị trí mới ở xa (tìm xã, dán tọa độ) thì bay tới
      if (m.getZoom() < 12 || !m.getBounds().contains([point.lat, point.lng])) m.setView([point.lat, point.lng], Math.min(14, MAP_MAX_ZOOM))
    } else {
      pin.current.remove()
      if (center) m.setView(center, 9)
      else m.setView(VIETNAM_CENTER, m.getMinZoom())
    }
  }, [point, center])

  return (
    <div className="shop-map-wrap">
      <div ref={box} className="shop-map farm-map" role="application" aria-label="Bản đồ chọn vị trí vườn" />
      {hint && <div className="map-hint">{hint}</div>}
    </div>
  )
}
