/**
 * Giá theo khu vực do điểm mua đóng góp + "Khu vực của tôi" (dùng chung web + app).
 */
import type { CategoryType, ShopType } from './api';

export type BuyerKind = 'doanh_nghiep' | 'dai_ly' | 'thuong_lai' | 'ban_le';
export type BuyerStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type ReportStatus = 'published' | 'needs_review' | 'rejected';

export const BUYER_KIND_LABELS: Record<BuyerKind, string> = {
  doanh_nghiep: 'Doanh nghiệp',
  dai_ly: 'Đại lý / cửa hàng',
  thuong_lai: 'Thương lái',
  ban_le: 'Điểm bán lẻ',
};

export const BUYER_STATUS_LABELS: Record<BuyerStatus, string> = {
  pending: '⏳ Chờ duyệt',
  approved: '✅ Đã duyệt',
  rejected: '❌ Không duyệt',
  suspended: '⛔ Tạm khóa',
};

/** Hồ sơ điểm mua của tài khoản đang đăng nhập */
export interface BuyerProfile {
  id: number;
  name: string;
  kind: BuyerKind;
  kind_label: string;
  deals_in: ShopType[];
  phone: string;
  address: string | null;
  province: string;
  province_name: string | null;
  lat: number;
  lng: number;
  goods: string | null;
  status: BuyerStatus;
  status_label: string;
  is_verified: boolean;
  admin_note: string | null;
}

export interface BuyerProfileInput {
  name: string;
  kind: BuyerKind;
  deals_in: ShopType[];
  phone: string;
  address?: string | null;
  province_code: string;
  lat: number;
  lng: number;
  goods?: string | null;
}

/** Giá mình (điểm mua) đã đăng */
export interface BuyerReport {
  id: number;
  product: { code: string; name: string; unit: string };
  date: string;
  price: number;
  unit: string;
  note: string | null;
  status: ReportStatus;
  status_label: string;
  review_reason: string | null;
}

export interface LocalPriceEntry {
  id: number;
  price: number;
  date: string;
  note: string | null;
  distance_km: number;
  buyer: { id: number; name: string; kind: BuyerKind; kind_label: string; is_verified: boolean; phone: string; address: string | null; shop_id: number | null };
}

/** Giá 1 mặt hàng quanh vị trí: nhiều điểm mua, kèm giá chung của tỉnh để so */
export interface LocalPriceProduct {
  product: { code: string; name: string; unit: string; type: CategoryType };
  count: number;
  min: number;
  max: number;
  median: number;
  latest_date: string;
  reference: { price: number; region: string; date: string } | null;
  entries: LocalPriceEntry[];
}

export interface LocalPrices {
  data: LocalPriceProduct[];
  meta: { radius_km: number; days: number; province: string | null; province_name: string | null };
}

export interface LocalPriceFilters {
  lat: number;
  lng: number;
  province?: string | null;
  radius?: number;
  days?: number;
  type?: CategoryType;
  product?: string;
}

/** Khu vực của tôi: lưu trên máy; đăng nhập thì lưu cả vào tài khoản */
export interface MyLocation {
  province: string;
  province_name?: string | null;
  lat: number;
  lng: number;
  /** Tên chỗ ở người dùng tự đặt ("Xã Hòa Thuận"); null = trung tâm tỉnh */
  label: string | null;
  radius: number;
  /** true: tọa độ lấy từ GPS; false: trung tâm tỉnh */
  gps?: boolean;
}

export const RADIUS_OPTIONS = [10, 20, 30, 50];

/** Tọa độ trung tâm hành chính 34 tỉnh/thành (giống App\Support\Geo ở backend) */
export const PROVINCE_CENTERS: Record<string, [number, number]> = {
  'ha-noi': [21.0285, 105.8542], hue: [16.4637, 107.5909], 'lai-chau': [22.3964, 103.4582], 'dien-bien': [21.386, 103.023],
  'son-la': [21.327, 103.9141], 'lang-son': [21.8537, 106.761], 'quang-ninh': [20.959, 107.0448], 'thanh-hoa': [19.8067, 105.7852],
  'nghe-an': [18.6796, 105.6813], 'ha-tinh': [18.3428, 105.9057], 'cao-bang': [22.6657, 106.257], 'tuyen-quang': [21.8233, 105.218],
  'lao-cai': [21.7051, 104.8752], 'thai-nguyen': [21.5942, 105.8482], 'phu-tho': [21.3227, 105.4019], 'bac-ninh': [21.2731, 106.1946],
  'hung-yen': [20.6464, 106.0511], 'hai-phong': [20.8449, 106.6881], 'ninh-binh': [20.2506, 105.9745], 'quang-tri': [17.4689, 106.6223],
  'da-nang': [16.0544, 108.2022], 'quang-ngai': [15.1214, 108.8044], 'gia-lai': [13.782, 109.2194], 'khanh-hoa': [12.2388, 109.1967],
  'lam-dong': [11.9404, 108.4583], 'dak-lak': [12.6667, 108.05], 'ho-chi-minh': [10.7769, 106.7009], 'dong-nai': [10.9574, 106.8427],
  'tay-ninh': [10.5359, 106.4137], 'can-tho': [10.0452, 105.7469], 'vinh-long': [10.2397, 105.9572], 'dong-thap': [10.36, 106.36],
  'ca-mau': [9.1769, 105.1524], 'an-giang': [10.0125, 105.0809],
};

/** Khu vực = trung tâm tỉnh (khi không bật GPS) */
export function provinceLocation(province: string, radius = 30, provinceName?: string | null): MyLocation | null {
  const center = PROVINCE_CENTERS[province];
  return center ? { province, province_name: provinceName ?? null, lat: center[0], lng: center[1], label: null, radius, gps: false } : null;
}

/** Tỉnh có trung tâm gần tọa độ nhất (đoán tỉnh từ GPS khi người dùng chưa chọn) */
export function nearestProvince(lat: number, lng: number): string {
  let best = 'ha-noi';
  let bestDistance = Infinity;
  for (const [code, [cLat, cLng]] of Object.entries(PROVINCE_CENTERS)) {
    const d = (cLat - lat) ** 2 + ((cLng - lng) * Math.cos((lat * Math.PI) / 180)) ** 2;
    if (d < bestDistance) {
      best = code;
      bestDistance = d;
    }
  }
  return best;
}

/** "Xã Hòa Thuận, Đắk Lắk · 30 km" / "Trung tâm Đắk Lắk · 30 km" */
export function describeLocation(location: MyLocation): string {
  const place = location.label ? `${location.label}${location.province_name ? `, ${location.province_name}` : ''}` : location.gps ? `Vị trí của tôi${location.province_name ? `, ${location.province_name}` : ''}` : `Trung tâm ${location.province_name ?? location.province}`;
  return `${place} · ${location.radius} km`;
}

/**
 * So giá điểm mua với giá chung: nông sản cao hơn giá chung là có lợi cho người bán (xanh),
 * phân / thuốc thấp hơn giá chung là có lợi cho người mua (xanh).
 */
export function compareToReference(price: number, reference: number | null | undefined, type: CategoryType): { diff: number; percent: number; good: boolean } | null {
  if (!reference) return null;
  const diff = price - reference;
  return { diff, percent: Math.round((diff / reference) * 100), good: type === 'nong_san' ? diff >= 0 : diff <= 0 };
}
