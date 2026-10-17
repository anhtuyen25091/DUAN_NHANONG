import { PROVINCE_CENTERS, PROVINCE_NAMES } from './local';

/** 1 lớp ô bản đồ, chỉ hiện trong khoảng mức phóng [minZoom, maxZoom] */
export interface MapTiles {
  url: string;
  subdomains: string;
  attribution: string;
  minZoom: number;
  maxZoom: number;
  /** Mức phóng lớn nhất có ô thật; phóng hơn thì phóng to ô mức này */
  maxNativeZoom: number;
}

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';

/**
 * Ô bản đồ mặc định (dùng chung web và app), không ô nào có "đường lưỡi bò" hay chữ nước ngoài ở Hoàng Sa, Trường Sa:
 * - Thu nhỏ (xem cả nước, mức ≤ 9): nền địa hình Esri World Terrain Base, **không có chữ, không có đường biên**.
 *   Không dùng OSM / Esri Light Gray ở mức này vì có tên tiếng Anh, tiếng Pháp, có ô ghi chữ Trung Quốc ở 2 quần đảo.
 *   Tên trên bản đồ do mình tự vẽ bằng tiếng Việt (MAP_LABELS + tên tỉnh).
 * - Phóng gần (mức ≥ 10, xem huyện / xã): nền xám Esri Light Gray Base có đường sá, tên địa danh tiếng Việt;
 *   đã kiểm tra: vùng Hoàng Sa, Trường Sa ở các mức này không có chữ, không có đường kẻ.
 * Khi phát hành: dùng thương mại cần tài khoản ArcGIS (có hạn mức miễn phí), hoặc đổi sang nhà cung cấp bản đồ Việt Nam
 * có giấy phép qua biến môi trường web VITE_MAP_TILE_URL / VITE_MAP_TILE_ATTRIBUTION,
 * app EXPO_PUBLIC_MAP_TILE_URL / EXPO_PUBLIC_MAP_TILE_ATTRIBUTION.
 */
export const MAP_TILES: MapTiles[] = [
  { url: `${ESRI}/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}`, subdomains: 'abc', attribution: 'Nền bản đồ © Esri', minZoom: 0, maxZoom: 9, maxNativeZoom: 9 },
  { url: `${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, subdomains: 'abc', attribution: 'Nền bản đồ © Esri', minZoom: 10, maxZoom: 17, maxNativeZoom: 16 },
];

/** Phóng to nhất được */
export const MAP_MAX_ZOOM = 17;

/** Ô bản đồ đã tính biến môi trường (để trống thì dùng mặc định) */
export function mapTiles(url?: string, attribution?: string): MapTiles[] {
  return url ? [{ url, subdomains: 'abc', attribution: attribution || MAP_TILES[0].attribution, minZoom: 0, maxZoom: MAP_MAX_ZOOM, maxNativeZoom: 19 }] : MAP_TILES;
}

/**
 * Khung bản đồ chỉ trong lãnh thổ Việt Nam: đất liền + Biển Đông, gồm quần đảo Hoàng Sa (khoảng 15,7–17,1°B; 111–113°Đ)
 * và quần đảo Trường Sa (khoảng 6,5–11,5°B; 111,5–117,5°Đ). Không cho kéo / thu nhỏ ra ngoài.
 */
export const VIETNAM_BOUNDS: [[number, number], [number, number]] = [
  [6.0, 101.8],
  [23.6, 117.9],
];
export const MAP_MIN_ZOOM = 5;

export type MapLabelKind = 'sovereignty' | 'sea' | 'province';

/** Tên tự vẽ trên bản đồ (tiếng Việt). Hoàng Sa, Trường Sa luôn hiện; tên tỉnh hiện khi phóng to. */
export const MAP_LABELS: Array<{ text: string; at: [number, number]; kind: MapLabelKind }> = [
  { text: 'Quần đảo Hoàng Sa (Việt Nam)', at: [16.45, 112.0], kind: 'sovereignty' },
  { text: 'Quần đảo Trường Sa (Việt Nam)', at: [9.6, 114.2], kind: 'sovereignty' },
  { text: 'Biển Đông', at: [13.4, 111.6], kind: 'sea' },
  { text: 'Vịnh Bắc Bộ', at: [20.0, 107.6], kind: 'sea' },
  { text: 'Vịnh Thái Lan', at: [9.6, 103.2], kind: 'sea' },
];

/** Tên tỉnh hiện trong khoảng mức phóng này (thu nhỏ quá thì chữ chồng lên nhau; phóng gần thì nền đã có tên) */
export const PROVINCE_LABEL_MIN_ZOOM = 7;
export const PROVINCE_LABEL_MAX_ZOOM = 9;

/** Tên 34 tỉnh/thành đặt ở trung tâm tỉnh */
export function provinceLabels(): Array<{ text: string; at: [number, number] }> {
  return Object.entries(PROVINCE_CENTERS).map(([code, at]) => ({ text: PROVINCE_NAMES[code] ?? code, at }));
}

/** Lời nhắc khi kéo bản đồ sai cách (để trang vẫn cuộn được bằng 1 ngón tay / con lăn chuột) */
export const MAP_GESTURE_HINTS = {
  touch: 'Dùng 2 ngón tay để kéo bản đồ',
  wheel: 'Giữ phím Ctrl và lăn chuột để phóng to / thu nhỏ',
};

/** Giữa Việt Nam (kể cả biển đảo), khi chưa có điểm nào để canh bản đồ */
export const VIETNAM_CENTER: [number, number] = [15.2, 108.9];
export const VIETNAM_ZOOM = 5;

/** Màu chấm theo loại điểm: thu mua (xanh lá), phân bón (cam), thuốc BVTV (tím) */
export const SHOP_TYPE_COLORS = {
  thu_mua: '#1b7a3a',
  phan_bon: '#d9822b',
  thuoc_bvtv: '#7b4bb7',
} as const;

/** Ghi chú khi vị trí điểm bán chưa đúng nhà (lấy theo địa chỉ trong danh sách của Sở…) */
export function geoNote(precision: 'exact' | 'place' | 'district' | 'province' | null | undefined): string | null {
  if (precision === 'place') return '📍 Vị trí gần đúng (tâm xã), hãy hỏi đường khi đến';
  if (precision === 'district') return '📍 Vị trí gần đúng (tâm huyện cũ), hãy hỏi đường khi đến';
  if (precision === 'province') return '📍 Chưa rõ vị trí, chấm trên bản đồ đặt ở giữa tỉnh';
  return null;
}

/**
 * Điểm có vị trí gần đúng (tâm xã / huyện / tỉnh) thường chồng lên nhau: dàn nhẹ ra quanh tâm theo id
 * (cố định, không đổi mỗi lần mở) để bấm được từng điểm. Điểm đúng nhà giữ nguyên.
 */
export function spreadPoint(lat: number, lng: number, id: number, precision: 'exact' | 'place' | 'district' | 'province' | null | undefined): [number, number] {
  const maxMeters = precision === 'place' ? 600 : precision === 'district' ? 2000 : precision === 'province' ? 5000 : 0;
  if (maxMeters === 0) return [lat, lng];
  const angle = id * 2.39996; // góc vàng: các điểm không thẳng hàng
  const meters = maxMeters * (0.25 + 0.75 * (((id * 7919) % 97) / 96));
  const dLat = (meters * Math.cos(angle)) / 111_320;
  const dLng = (meters * Math.sin(angle)) / (111_320 * Math.cos((lat * Math.PI) / 180));
  return [lat + dLat, lng + dLng];
}
