import {
  directionsUrl,
  geoNote,
  MAP_GESTURE_HINTS,
  MAP_LABELS,
  MAP_MAX_ZOOM,
  MAP_MIN_ZOOM,
  mapTiles,
  PROVINCE_LABEL_MAX_ZOOM,
  PROVINCE_LABEL_MIN_ZOOM,
  provinceLabels,
  SHOP_TYPE_COLORS,
  SHOP_TYPE_LABELS,
  telHref,
  VIETNAM_BOUNDS,
  VIETNAM_CENTER,
  VIETNAM_ZOOM,
  type Shop,
  type ShopFilters,
} from '@nhanong/shared'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { Status } from '../components/Status'
import { href, useAsync } from '../hooks'

const TILES = mapTiles(import.meta.env.VITE_MAP_TILE_URL, import.meta.env.VITE_MAP_TILE_ATTRIBUTION)

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** Nội dung khi bấm vào 1 chấm: tên, loại, địa chỉ, gọi, chỉ đường */
function popupHtml(shop: Shop): string {
  const address = [shop.address, shop.province_name].filter(Boolean).join(', ')
  return [
    `<b>${escape(shop.name)}</b>${shop.is_verified ? ' <span class="badge">✓</span>' : ''}`,
    `<div class="small muted">${escape(shop.types.map((t) => SHOP_TYPE_LABELS[t]).join(' · '))}</div>`,
    address && `<div>${escape(address)}</div>`,
    shop.goods && `<div class="small">Mặt hàng: ${escape(shop.goods)}</div>`,
    geoNote(shop.geo_precision) && `<div class="small muted">${escape(geoNote(shop.geo_precision)!)}</div>`,
    `<div class="map-popup-actions">`,
    shop.phone ? `<a class="button primary" href="${escape(telHref(shop.phone))}">📞 ${escape(shop.phone)}</a>` : '',
    `<a class="button" href="${escape(directionsUrl(shop))}" target="_blank" rel="noreferrer">🧭 Chỉ đường</a>`,
    `<a class="button subtle" href="${escape(href('diem-ban/de-xuat', { sua: String(shop.id), ten: shop.name }))}">Báo sai</a>`,
    `</div>`,
  ]
    .filter(Boolean)
    .join('')
}

const label = (text: string, className: string) => L.divIcon({ className: `vn-label ${className}`, html: `<span>${escape(text).replace(' (', '<br>(')}</span>`, iconSize: [0, 0] })

/**
 * Bản đồ chỉ trong Việt Nam: không kéo / thu nhỏ ra ngoài; nền không chữ, tên tự vẽ bằng tiếng Việt
 * (luôn có "Quần đảo Hoàng Sa (Việt Nam)", "Quần đảo Trường Sa (Việt Nam)").
 * Để trang vẫn cuộn được: điện thoại kéo bản đồ bằng 2 ngón tay, máy tính giữ Ctrl + lăn chuột để phóng to.
 */
function createVietnamMap(box: HTMLDivElement, onHint: (text: string) => void): L.Map {
  const bounds = L.latLngBounds(VIETNAM_BOUNDS)
  const touch = L.Browser.mobile || L.Browser.touch
  const m = L.map(box, {
    center: VIETNAM_CENTER,
    zoom: VIETNAM_ZOOM,
    minZoom: MAP_MIN_ZOOM,
    maxZoom: MAP_MAX_ZOOM,
    maxBounds: bounds,
    maxBoundsViscosity: 1,
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

/**
 * Bản đồ điểm bán (cùng bộ lọc với danh sách): mỗi điểm 1 chấm màu theo loại, bấm vào xem thông tin.
 * Đang xem "Gần tôi" thì có chấm vị trí của mình và vòng bán kính.
 */
export default function ShopMap({ filters, position }: { filters: ShopFilters; position: { lat: number; lng: number } | null }) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const hintTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [state, retry] = useAsync(() => api.shops({ ...filters, map: 1 }), [filters.type, filters.province, filters.q, filters.lat, filters.lng])

  useEffect(() => {
    if (!box.current) return
    const m = createVietnamMap(box.current, (text) => {
      setHint(text)
      clearTimeout(hintTimer.current)
      hintTimer.current = setTimeout(() => setHint(null), 1500)
    })
    map.current = m
    layer.current = L.layerGroup().addTo(m)
    return () => {
      clearTimeout(hintTimer.current)
      m.remove()
      map.current = null
    }
  }, [])

  useEffect(() => {
    const m = map.current
    const group = layer.current
    if (!m || !group || state.status !== 'ok') return
    group.clearLayers()
    const points: L.LatLngExpression[] = []
    for (const shop of state.data.data) {
      if (shop.lat === null || shop.lng === null) continue
      const color = SHOP_TYPE_COLORS[shop.types[0] ?? 'thu_mua']
      L.circleMarker([shop.lat, shop.lng], { radius: 9, color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.95 })
        .bindPopup(popupHtml(shop), { maxWidth: 280 })
        .bindTooltip(shop.name)
        .addTo(group)
      points.push([shop.lat, shop.lng])
    }
    if (position) {
      const radiusKm = state.data.meta.radius_km ?? 30
      L.circle([position.lat, position.lng], { radius: radiusKm * 1000, color: '#1b7a3a', weight: 1, fillOpacity: 0.04 }).addTo(group)
      L.circleMarker([position.lat, position.lng], { radius: 7, color: '#fff', weight: 3, fillColor: '#1a73e8', fillOpacity: 1 })
        .bindTooltip('Vị trí của tôi')
        .addTo(group)
      points.push([position.lat, position.lng])
    }
    if (points.length > 1) m.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 14 })
    else if (points.length === 1) m.setView(points[0], 13)
    else m.setView(VIETNAM_CENTER, m.getMinZoom())
  }, [state, position])

  return (
    <>
      <Status state={state} retry={retry} />
      {state.status === 'ok' && (
        <p className="muted small">
          {state.data.meta.total} điểm có vị trí trên bản đồ
          {state.data.meta.has_more ? ' (đang hiện 500 điểm đầu, hãy lọc theo tỉnh hoặc loại để xem đủ)' : ''}
        </p>
      )}
      <div className="shop-map-wrap">
        <div className="shop-map" ref={box} role="region" aria-label="Bản đồ điểm bán" />
        {hint && (
          <div className="map-hint" aria-live="polite">
            {hint}
          </div>
        )}
      </div>
      <p className="map-legend small">
        {(Object.keys(SHOP_TYPE_COLORS) as (keyof typeof SHOP_TYPE_COLORS)[]).map((t) => (
          <span key={t}>
            <i style={{ background: SHOP_TYPE_COLORS[t] }} /> {SHOP_TYPE_LABELS[t]}
          </span>
        ))}
      </p>
    </>
  )
}
