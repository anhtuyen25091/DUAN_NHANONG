import { directionsUrl, mapTiles, SHOP_TYPE_COLORS, SHOP_TYPE_LABELS, telHref, VIETNAM_CENTER, VIETNAM_ZOOM, type Shop, type ShopFilters } from '@nhanong/shared'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
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
    `<div class="map-popup-actions">`,
    shop.phone ? `<a class="button primary" href="${escape(telHref(shop.phone))}">📞 ${escape(shop.phone)}</a>` : '',
    `<a class="button" href="${escape(directionsUrl(shop))}" target="_blank" rel="noreferrer">🧭 Chỉ đường</a>`,
    `<a class="button subtle" href="${escape(href('diem-ban/de-xuat', { sua: String(shop.id), ten: shop.name }))}">Báo sai</a>`,
    `</div>`,
  ]
    .filter(Boolean)
    .join('')
}

/**
 * Bản đồ điểm bán (cùng bộ lọc với danh sách): mỗi điểm 1 chấm màu theo loại, bấm vào xem thông tin.
 * Đang xem "Gần tôi" thì có chấm vị trí của mình và vòng bán kính.
 */
export default function ShopMap({ filters, position }: { filters: ShopFilters; position: { lat: number; lng: number } | null }) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const [state, retry] = useAsync(() => api.shops({ ...filters, map: 1 }), [filters.type, filters.province, filters.q, filters.lat, filters.lng])

  useEffect(() => {
    if (!box.current) return
    const m = L.map(box.current, { center: VIETNAM_CENTER, zoom: VIETNAM_ZOOM })
    L.tileLayer(TILES.url, { subdomains: TILES.subdomains, attribution: TILES.attribution, maxZoom: TILES.maxZoom }).addTo(m)
    map.current = m
    layer.current = L.layerGroup().addTo(m)
    return () => {
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
      L.circleMarker([position.lat, position.lng], { radius: 7, color: '#fff', weight: 3, fillColor: '#1a73e8', fillOpacity: 1 }).bindTooltip('Vị trí của tôi').addTo(group)
      points.push([position.lat, position.lng])
    }
    if (points.length > 1) m.fitBounds(L.latLngBounds(points), { padding: [30, 30], maxZoom: 14 })
    else if (points.length === 1) m.setView(points[0], 13)
    else m.setView(VIETNAM_CENTER, VIETNAM_ZOOM)
  }, [state, position])

  return (
    <>
      <Status state={state} retry={retry} />
      {state.status === 'ok' && (
        <p className="muted small">
          {state.data.meta.total} điểm có vị trí trên bản đồ{state.data.meta.has_more ? ' (đang hiện 500 điểm đầu, hãy lọc theo tỉnh hoặc loại để xem đủ)' : ''}
        </p>
      )}
      <div className="shop-map" ref={box} role="region" aria-label="Bản đồ điểm bán" />
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
