import { MAP_GESTURE_HINTS, MAP_LABELS, MAP_MAX_ZOOM, MAP_MIN_ZOOM, mapTiles, PROVINCE_LABEL_MAX_ZOOM, PROVINCE_LABEL_MIN_ZOOM, provinceLabels, VIETNAM_BOUNDS, VIETNAM_CENTER, VIETNAM_ZOOM } from '@nhanong/shared'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

/** Bản đồ dùng chung: điểm bán (pages/ShopMap) và chọn vị trí trang trại (pages/iot/FarmLocation) */
export const TILES = mapTiles(import.meta.env.VITE_MAP_TILE_URL, import.meta.env.VITE_MAP_TILE_ATTRIBUTION)

export const escape = (text: string) => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const label = (text: string, className: string) => L.divIcon({ className: `vn-label ${className}`, html: `<span>${escape(text).replace(' (', '<br>(')}</span>`, iconSize: [0, 0] })

/**
 * Bản đồ chỉ trong Việt Nam: không kéo / thu nhỏ ra ngoài; nền không chữ, tên tự vẽ bằng tiếng Việt
 * (luôn có "Quần đảo Hoàng Sa (Việt Nam)", "Quần đảo Trường Sa (Việt Nam)").
 * Để trang vẫn cuộn được: điện thoại kéo bản đồ bằng 2 ngón tay, máy tính giữ Ctrl + lăn chuột để phóng to.
 */
export function createVietnamMap(box: HTMLDivElement, onHint: (text: string) => void): L.Map {
  const bounds = L.latLngBounds(VIETNAM_BOUNDS)
  const touch = L.Browser.mobile || L.Browser.touch
  const m = L.map(box, {
    center: VIETNAM_CENTER,
    zoom: VIETNAM_ZOOM,
    minZoom: MAP_MIN_ZOOM,
    maxZoom: MAP_MAX_ZOOM,
    maxBounds: bounds,
    maxBoundsViscosity: 1,
    // Vẽ chấm bằng canvas: vài nghìn điểm vẫn mượt
    preferCanvas: true,
    dragging: !touch,
  })
  for (const t of TILES) L.tileLayer(t.url, { ...t, bounds: bounds.pad(1) }).addTo(m)
  // Thu nhỏ tối đa = vừa khít cả nước (kể cả 2 quần đảo), không thấy nước khác
  m.setMinZoom(Math.max(4, m.getBoundsZoom(bounds)))

  for (const l of MAP_LABELS) L.marker(l.at, { icon: label(l.text, l.kind), interactive: false, keyboard: false }).addTo(m)
  const provinces = L.layerGroup(provinceLabels().map((l) => L.marker(l.at, { icon: label(l.text, 'province'), interactive: false, keyboard: false })))
  const toggleProvinces = () => (m.getZoom() >= PROVINCE_LABEL_MIN_ZOOM && m.getZoom() <= PROVINCE_LABEL_MAX_ZOOM ? provinces.addTo(m) : provinces.remove())
  m.on('zoomend', toggleProvinces)
  toggleProvinces()

  // Con lăn chuột không giữ Ctrl: để trang cuộn bình thường, chỉ nhắc cách phóng to
  box.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey || e.metaKey) return
      e.stopPropagation()
      onHint(MAP_GESTURE_HINTS.wheel)
    },
    { capture: true },
  )
  // 1 ngón tay: trang cuộn; 2 ngón tay: kéo + phóng to bản đồ (Leaflet tự làm khi chụm 2 ngón)
  if (touch) box.addEventListener('touchmove', (e) => e.touches.length === 1 && onHint(MAP_GESTURE_HINTS.touch), { passive: true })
  return m
}
