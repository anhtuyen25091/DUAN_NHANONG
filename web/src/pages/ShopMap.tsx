import {
  directionsUrl,
  geoNote,
  MAP_MAX_ZOOM,
  PROVINCE_CENTERS,
  SHOP_TYPE_COLORS,
  SHOP_TYPE_LABELS,
  spreadPoint,
  telHref,
  VIETNAM_CENTER,
  type Shop,
  type ShopFilters,
  type ShopMapView,
} from '@nhanong/shared'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { href } from '../hooks'
import { createVietnamMap, escape } from '../vietnamMap'

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
