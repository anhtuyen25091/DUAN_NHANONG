import { MAP_LABELS, MAP_MAX_ZOOM, MAP_MIN_ZOOM, mapTiles, PROVINCE_LABEL_MAX_ZOOM, PROVINCE_LABEL_MIN_ZOOM, provinceLabels, VIETNAM_BOUNDS, type Shop } from '@nhanong/shared';

const TILES = mapTiles(process.env.EXPO_PUBLIC_MAP_TILE_URL, process.env.EXPO_PUBLIC_MAP_TILE_ATTRIBUTION);
const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist';

/** 1 điểm đã chuẩn bị sẵn để vẽ (tọa độ đã dàn, chữ đã ghép) */
export type MapShop = Pick<Shop, 'id' | 'name' | 'lat' | 'lng' | 'phone' | 'address' | 'province_name' | 'goods' | 'is_verified'> & { color: string; types: string; note: string | null; source: string | null };

/** Dữ liệu app đưa vào bản đồ mỗi lần tải xong khung đang xem (window.render) */
export interface MapRender {
  shops: MapShop[];
  clusters: Array<{ lat: number; lng: number; count: number }>;
  position: { lat: number; lng: number } | null;
  radiusKm: number;
}

/**
 * Trang bản đồ chạy trong WebView: Leaflet + nền không chữ, chỉ trong Việt Nam, tên tự vẽ bằng tiếng Việt (có Hoàng Sa, Trường Sa).
 * Kéo / phóng xong thì báo khung đang xem về app ({action: 'view', bbox, zoom}); app tải rồi gọi window.render(MapRender):
 * nhiều điểm thì vẽ cụm ghi số (bấm để phóng to), ít điểm thì vẽ từng chấm, bấm nút trong ô thông tin thì báo về app.
 */
export function mapHtml(view: { center: [number, number]; zoom: number | null }): string {
  // Dữ liệu nhúng vào <script>: chặn "</script>"
  const data = JSON.stringify({
    tiles: TILES,
    center: view.center,
    zoom: view.zoom,
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
.vn-label.province span{color:#444;font-size:12px}
.leaflet-marker-icon.cl{box-sizing:border-box;display:flex;align-items:center;justify-content:center;border-radius:50%;background:rgba(27,122,58,.85);border:3px solid rgba(255,255,255,.9);box-shadow:0 0 0 3px rgba(27,122,58,.25);color:#fff;font-weight:700;font-size:13px;line-height:1}</style></head><body><div id="map"></div>
<script src="${LEAFLET}/leaflet.js"></script><script>
const D=${data};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const post=m=>window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(m));
const send=(action,id)=>post({action,id});
const B=L.latLngBounds(D.bounds);
const map=L.map('map',{center:D.center,zoom:D.zoom||5,minZoom:D.minZoom,maxZoom:D.maxZoom,maxBounds:B,maxBoundsViscosity:1,preferCanvas:true});
for(const t of D.tiles)L.tileLayer(t.url,Object.assign({},t,{bounds:B.pad(1)})).addTo(map);
map.setMinZoom(Math.max(4,map.getBoundsZoom(B)));
if(D.zoom===null)map.setView(D.center,map.getMinZoom());
const label=(t,k)=>L.marker(t.at,{interactive:false,keyboard:false,icon:L.divIcon({className:'vn-label '+k,html:'<span>'+esc(t.text).replace(' (','<br>(')+'</span>',iconSize:[0,0]})});
for(const t of D.labels)label(t,t.kind).addTo(map);
const prov=L.layerGroup(D.provinces.map(t=>label(t,'province')));
const showProv=()=>map.getZoom()>=D.provinceZoom[0]&&map.getZoom()<=D.provinceZoom[1]?prov.addTo(map):prov.remove();
map.on('zoomend',showProv);showProv();
const layer=L.layerGroup().addTo(map);
let timer;
const report=()=>{clearTimeout(timer);timer=setTimeout(()=>{const b=map.getBounds();post({action:'view',bbox:[b.getSouth(),b.getWest(),b.getNorth(),b.getEast()].map(n=>n.toFixed(4)).join(','),zoom:Math.round(map.getZoom())})},250)};
map.on('moveend',report);
window.render=R=>{
  layer.clearLayers();
  for(const c of R.clusters){
    const size=c.count<10?30:c.count<100?36:c.count<1000?42:48;
    L.marker([c.lat,c.lng],{icon:L.divIcon({className:'cl',html:'<span>'+c.count.toLocaleString('vi-VN')+'</span>',iconSize:[size,size]})})
      .on('click',()=>map.setView([c.lat,c.lng],Math.min(map.getZoom()+2,D.maxZoom))).addTo(layer);
  }
  for(const s of R.shops){
    const place=[s.address,s.province_name].filter(Boolean).join(', ');
    const html='<b>'+esc(s.name)+'</b>'+(s.is_verified?' ✓':'')+'<div class="muted">'+esc(s.types)+'</div>'+(place?'<div>'+esc(place)+'</div>':'')+(s.goods?'<div class="muted">Mặt hàng: '+esc(s.goods)+'</div>':'')+(s.note?'<div class="muted">'+esc(s.note)+'</div>':'')
      +'<div class="acts">'+(s.phone?'<button class="primary" onclick="send(\\'call\\','+s.id+')">📞 '+esc(s.phone)+'</button>':'')
      +'<button onclick="send(\\'directions\\','+s.id+')">🧭 Chỉ đường</button><button onclick="send(\\'report\\','+s.id+')">Báo sai</button></div>'
      +(s.source?'<div class="muted">Nguồn: '+esc(s.source)+' · <a href="#" onclick="send(\\'remove\\','+s.id+');return false">Chủ điểm? Xin gỡ</a></div>':'');
    L.circleMarker([s.lat,s.lng],{radius:11,color:'#fff',weight:2,fillColor:s.color,fillOpacity:.95}).bindPopup(html,{maxWidth:260}).addTo(layer);
  }
  if(R.position){
    L.circle([R.position.lat,R.position.lng],{radius:R.radiusKm*1000,color:'#1b7a3a',weight:1,fillOpacity:.04,interactive:false}).addTo(layer);
    L.circleMarker([R.position.lat,R.position.lng],{radius:8,color:'#fff',weight:3,fillColor:'#1a73e8',fillOpacity:1}).addTo(layer);
  }
};
report();
</script></body></html>`;
}
