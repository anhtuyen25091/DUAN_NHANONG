import {
  directionsUrl,
  geoNote,
  MAP_GESTURE_HINTS,
  MAP_LABELS,
  MAP_MAX_ZOOM,
  MAP_MIN_ZOOM,
  PROVINCE_CENTERS,
  mapTiles,
  PROVINCE_LABEL_MAX_ZOOM,
  PROVINCE_LABEL_MIN_ZOOM,
  provinceLabels,
  SHOP_TYPE_COLORS,
  SHOP_TYPE_LABELS,
  spreadPoint,
  telHref,
  VIETNAM_BOUNDS,
  VIETNAM_CENTER,
  VIETNAM_ZOOM,
  type Shop,
  type ShopFilters,
  type ShopMapView,
} from '@nhanong/shared'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { href } from '../hooks'

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
    shop.source && `<div class="small muted">Nguồn: ${escape(shop.source)} · <a href="${escape(href('diem-ban/xin-go', { id: String(shop.id), ten: shop.name }))}">Chủ điểm? Xin gỡ</a></div>`,
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

/** Cụm điểm: vòng tròn ghi số điểm, to dần theo số */
const clusterIcon = (count: number) => {
  const size = count < 10 ? 28 : count < 100 ? 34 : count < 1000 ? 40 : 46
  return L.divIcon({ className: 'map-cluster', html: `<span>${count.toLocaleString('vi-VN')}</span>`, iconSize: [size, size] })
}

/** Lấy khung xem ban đầu: gần tôi → quanh vị trí; chọn tỉnh → giữa tỉnh; còn lại → cả nước */
function initialView(m: L.Map, filters: ShopFilters, position: { lat: number; lng: number } | null) {
  const province = filters.province ? PROVINCE_CENTERS[filters.province] : undefined
  if (position) m.setView([position.lat, position.lng], 11)
  else if (province) m.setView(province, 9)
  else m.setView(VIETNAM_CENTER, m.getMinZoom())
}

/**
 * Bản đồ điểm bán (cùng bộ lọc với danh sách), chỉ tải phần đang xem:
 * khung có nhiều điểm thì máy chủ gom thành cụm (vòng tròn ghi số, bấm vào để phóng to),
 * ít điểm thì hiện từng chấm màu theo loại, bấm vào xem thông tin.
 * Đang xem "Gần tôi" thì có chấm vị trí của mình và vòng bán kính.
 */
export default function ShopMap({ filters, position }: { filters: ShopFilters; position: { lat: number; lng: number } | null }) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const hintTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [view, setView] = useState<{ status: 'loading' } | { status: 'ok'; data: ShopMapView } | { status: 'error'; message: string }>({ status: 'loading' })
  // Bộ lọc mới nhất (đọc trong sự kiện kéo / phóng bản đồ)
  const current = useRef({ filters, position })
  useEffect(() => {
    current.current = { filters, position }
  })
  const loadRef = useRef<() => void>(() => {})

  useEffect(() => {
    if (!box.current) return
    const m = createVietnamMap(box.current, (text) => {
      setHint(text)
      clearTimeout(hintTimer.current)
      hintTimer.current = setTimeout(() => setHint(null), 1500)
    })
    map.current = m
    layer.current = L.layerGroup().addTo(m)

    // Tải điểm trong khung đang xem; kéo / phóng liên tục thì chỉ tải lần cuối
    let request = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const load = () => {
      clearTimeout(timer)
      timer = setTimeout(async () => {
        const id = ++request
        const b = m.getBounds()
        const { filters: f } = current.current
        setView((v) => (v.status === 'ok' ? v : { status: 'loading' }))
        try {
          const data = await api.shopMap({
            bbox: [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map((n) => n.toFixed(4)).join(','),
            zoom: Math.round(m.getZoom()),
            type: f.type,
            province: f.province,
            q: f.q || undefined,
          })
          if (id === request) setView({ status: 'ok', data })
        } catch (error) {
          if (id === request) setView({ status: 'error', message: (error as Error).message })
        }
      }, 250)
    }
    loadRef.current = load
    m.on('moveend', load)
    return () => {
      clearTimeout(timer)
      clearTimeout(hintTimer.current)
      m.remove()
      map.current = null
    }
  }, [])

  // Đổi bộ lọc / vị trí: về khung xem phù hợp rồi tải lại
  useEffect(() => {
    const m = map.current
    if (!m) return
    initialView(m, filters, position)
    loadRef.current()
    // Chỉ chạy lại khi giá trị lọc đổi (filters là object mới mỗi lần render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.type, filters.province, filters.q, position?.lat, position?.lng])

  useEffect(() => {
    const m = map.current
    const group = layer.current
    if (!m || !group || view.status !== 'ok') return
    group.clearLayers()
    for (const cluster of view.data.clusters) {
      L.marker([cluster.lat, cluster.lng], { icon: clusterIcon(cluster.count), title: `${cluster.count} điểm, bấm để phóng to` })
        .on('click', () => m.setView([cluster.lat, cluster.lng], Math.min(m.getZoom() + 2, MAP_MAX_ZOOM)))
        .addTo(group)
    }
    for (const shop of view.data.shops) {
      if (shop.lat === null || shop.lng === null) continue
      const color = SHOP_TYPE_COLORS[shop.types[0] ?? 'thu_mua']
      L.circleMarker(spreadPoint(shop.lat, shop.lng, shop.id, shop.geo_precision), { radius: 9, color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.95 })
        .bindPopup(popupHtml(shop), { maxWidth: 280 })
        .bindTooltip(shop.name)
        .addTo(group)
    }
    if (position) {
      L.circle([position.lat, position.lng], { radius: (filters.radius ?? 30) * 1000, color: '#1b7a3a', weight: 1, fillOpacity: 0.04, interactive: false }).addTo(group)
      L.circleMarker([position.lat, position.lng], { radius: 7, color: '#fff', weight: 3, fillColor: '#1a73e8', fillOpacity: 1 })
        .bindTooltip('Vị trí của tôi')
        .addTo(group)
    }
  }, [view, position, filters.radius])

  return (
    <>
      {view.status === 'error' && (
        <div className="notice error">
          {view.message}{' '}
          <button type="button" onClick={() => loadRef.current()}>
            Thử lại
          </button>
        </div>
      )}
      <p className="muted small">
        {view.status === 'ok'
          ? `${view.data.total.toLocaleString('vi-VN')} điểm trong khung đang xem${view.data.clusters.length ? ' · bấm vào vòng số để phóng to' : ''}`
          : 'Đang tải điểm bán…'}
      </p>
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
        <span>
          <i className="legend-cluster" /> Nhiều điểm (bấm để phóng to)
        </span>
      </p>
    </>
  )
}
