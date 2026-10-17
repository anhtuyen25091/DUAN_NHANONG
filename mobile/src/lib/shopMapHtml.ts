import { MAP_LABELS, MAP_MAX_ZOOM, MAP_MIN_ZOOM, mapTiles, PROVINCE_LABEL_MAX_ZOOM, PROVINCE_LABEL_MIN_ZOOM, provinceLabels, VIETNAM_BOUNDS, VIETNAM_CENTER, VIETNAM_ZOOM, type Shop } from '@nhanong/shared';

const TILES = mapTiles(process.env.EXPO_PUBLIC_MAP_TILE_URL, process.env.EXPO_PUBLIC_MAP_TILE_ATTRIBUTION);
const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist';

export type MapShop = Pick<Shop, 'id' | 'name' | 'lat' | 'lng' | 'phone' | 'address' | 'province_name' | 'goods' | 'is_verified'> & { color: string; types: string };

/**
 * Trang bản đồ chạy trong WebView: Leaflet + nền không chữ; bấm nút trong ô thông tin thì báo về app.
 * Chỉ trong Việt Nam (không kéo / thu nhỏ ra ngoài), tên tự vẽ bằng tiếng Việt, luôn có Hoàng Sa, Trường Sa (Việt Nam).
 */
export function mapHtml(shops: MapShop[], position: { lat: number; lng: number } | null, radiusKm: number): string {
  // Dữ liệu nhúng vào <script>: chặn "</script>" trong tên điểm
  const data = JSON.stringify({
    shops,
    position,
    radiusKm,
    tiles: TILES,
    center: VIETNAM_CENTER,
    zoom: VIETNAM_ZOOM,
    minZoom: MAP_MIN_ZOOM,
    maxZoom: MAP_MAX_ZOOM,
    bounds: VIETNAM_BOUNDS,
    labels: MAP_LABELS,
    provinces: provinceLabels(),
    provinceZoom: [PROVINCE_LABEL_MIN_ZOOM, PROVINCE_LABEL_MAX_ZOOM],
  }).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<link rel="stylesheet" href="${LEAFLET}/leaflet.css">
<style>html,body,#map{height:100%;margin:0}body{font:16px -apple-system,Roboto,sans-serif}.leaflet-popup-content{font-size:16px;line-height:1.45}
.muted{color:#666;font-size:14px}.acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.acts button{font-size:15px;padding:8px 10px;border-radius:8px;border:1px solid #1b7a3a;background:#fff;color:#1b7a3a}
.acts button.primary{background:#1b7a3a;color:#fff}
.vn-label span{position:absolute;transform:translate(-50%,-50%);white-space:nowrap;text-align:center;pointer-events:none;text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff}
.vn-label.sovereignty span{color:#b3261e;font-weight:700;font-size:13px}.vn-label.sea span{color:#2f6690;font-style:italic;font-size:13px}
.vn-label.province span{color:#444;font-size:12px}</style></head><body><div id="map"></div>
<script src="${LEAFLET}/leaflet.js"></script><script>
const D=${data};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const send=(action,id)=>window.ReactNativeWebView.postMessage(JSON.stringify({action,id}));
const B=L.latLngBounds(D.bounds);
const map=L.map('map',{center:D.center,zoom:D.zoom,minZoom:D.minZoom,maxZoom:D.maxZoom,maxBounds:B,maxBoundsViscosity:1});
for(const t of D.tiles)L.tileLayer(t.url,Object.assign({},t,{bounds:B.pad(1)})).addTo(map);
map.setMinZoom(Math.max(4,map.getBoundsZoom(B)));
const label=(t,k)=>L.marker(t.at,{interactive:false,keyboard:false,icon:L.divIcon({className:'vn-label '+k,html:'<span>'+esc(t.text).replace(' (','<br>(')+'</span>',iconSize:[0,0]})});
for(const t of D.labels)label(t,t.kind).addTo(map);
const prov=L.layerGroup(D.provinces.map(t=>label(t,'province')));
const showProv=()=>map.getZoom()>=D.provinceZoom[0]&&map.getZoom()<=D.provinceZoom[1]?prov.addTo(map):prov.remove();
map.on('zoomend',showProv);
const pts=[];
for(const s of D.shops){
  const place=[s.address,s.province_name].filter(Boolean).join(', ');
  const html='<b>'+esc(s.name)+'</b>'+(s.is_verified?' ✓':'')+'<div class="muted">'+esc(s.types)+'</div>'+(place?'<div>'+esc(place)+'</div>':'')+(s.goods?'<div class="muted">Mặt hàng: '+esc(s.goods)+'</div>':'')
    +'<div class="acts">'+(s.phone?'<button class="primary" onclick="send(\\'call\\','+s.id+')">📞 '+esc(s.phone)+'</button>':'')
    +'<button onclick="send(\\'directions\\','+s.id+')">🧭 Chỉ đường</button><button onclick="send(\\'report\\','+s.id+')">Báo sai</button></div>';
  L.circleMarker([s.lat,s.lng],{radius:11,color:'#fff',weight:2,fillColor:s.color,fillOpacity:.95}).bindPopup(html,{maxWidth:260}).addTo(map);
  pts.push([s.lat,s.lng]);
}
if(D.position){
  L.circle([D.position.lat,D.position.lng],{radius:D.radiusKm*1000,color:'#1b7a3a',weight:1,fillOpacity:.04}).addTo(map);
  L.circleMarker([D.position.lat,D.position.lng],{radius:8,color:'#fff',weight:3,fillColor:'#1a73e8',fillOpacity:1}).addTo(map);
  pts.push([D.position.lat,D.position.lng]);
}
if(pts.length>1)map.fitBounds(L.latLngBounds(pts),{padding:[30,30],maxZoom:14});else if(pts.length===1)map.setView(pts[0],13);else map.setView(D.center,map.getMinZoom());
showProv();
</script></body></html>`;
}
