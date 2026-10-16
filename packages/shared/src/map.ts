export interface MapTiles {
  url: string;
  subdomains: string;
  attribution: string;
  maxZoom: number;
}

/**
 * Ô bản đồ mặc định: OpenStreetMap (máy chủ OSM France, không cần khóa), dùng chung cho web và app.
 * Máy chủ này do tình nguyện viên chạy, chỉ hợp để chạy thử / ít người dùng. Khi phát hành, đặt nhà cung cấp riêng
 * (có khóa, ví dụ bản đồ Việt Nam có giấy phép) qua biến môi trường: web VITE_MAP_TILE_URL / VITE_MAP_TILE_ATTRIBUTION,
 * app EXPO_PUBLIC_MAP_TILE_URL / EXPO_PUBLIC_MAP_TILE_ATTRIBUTION.
 */
export const MAP_TILES: MapTiles = {
  url: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',
  subdomains: 'abc',
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://www.openstreetmap.fr/">OSM France</a>',
  maxZoom: 19,
};

/** Ô bản đồ đã tính biến môi trường (để trống thì dùng mặc định) */
export function mapTiles(url?: string, attribution?: string): MapTiles {
  return url ? { url, subdomains: 'abc', attribution: attribution || MAP_TILES.attribution, maxZoom: MAP_TILES.maxZoom } : MAP_TILES;
}

/** Giữa Việt Nam, khi chưa có điểm nào để canh bản đồ */
export const VIETNAM_CENTER: [number, number] = [14.06, 108.28];
export const VIETNAM_ZOOM = 5;

/** Màu chấm theo loại điểm: thu mua (xanh lá), phân bón (cam), thuốc BVTV (tím) */
export const SHOP_TYPE_COLORS = {
  thu_mua: '#1b7a3a',
  phan_bon: '#d9822b',
  thuoc_bvtv: '#7b4bb7',
} as const;
