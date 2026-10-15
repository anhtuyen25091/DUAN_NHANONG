import type { PriceRow, Shop } from './api';

/** 139500 -> "139.500" (không kèm đơn vị, dùng trong bảng giá) */
export function formatNumber(amount: number): string {
  return Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Khoảng giá: "92.500 - 93.200" hoặc "93.200" nếu bằng nhau */
export function formatPriceRange(row: Pick<PriceRow, 'price_min' | 'price_max'>): string {
  return row.price_min === row.price_max
    ? formatNumber(row.price_max)
    : `${formatNumber(row.price_min)} - ${formatNumber(row.price_max)}`;
}

export type Trend = 'up' | 'down' | 'flat' | 'none';

export function trendOf(change: number | null): Trend {
  if (change === null) return 'none';
  return change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
}

/** +1.500 / -700 / 0 / "" */
export function formatChange(change: number | null): string {
  if (change === null) return '';
  if (change === 0) return '0';
  return `${change > 0 ? '+' : '-'}${formatNumber(Math.abs(change))}`;
}

/** "2026-10-14" -> "14/10/2026"; short: "14/10" */
export function formatDate(date: string, short = false): string {
  const [y, m, d] = date.slice(0, 10).split('-');
  return short ? `${d}/${m}` : `${d}/${m}/${y}`;
}

/** Thời điểm ISO -> "15/10/2026 10:23" theo giờ máy (tự định dạng: Hermes trên Android không chắc có locale vi-VN) */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];

/** "2026-10-15" -> "Thứ Năm, 15/10/2026" (thứ tính theo lịch, không phụ thuộc múi giờ) */
export function formatDateLong(date: string): string {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${formatDate(date)}`;
}

/** Bỏ dấu tiếng Việt để tìm kiếm: "Hồ tiêu" -> "ho tieu" */
export function foldVietnamese(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

export function matchesSearch(row: PriceRow, query: string): boolean {
  const q = foldVietnamese(query.trim());
  if (!q) return true;
  return foldVietnamese(`${row.product.name} ${row.region.name} ${row.region.province ?? ''}`).includes(q);
}

/** Gom bảng giá theo mặt hàng (giữ thứ tự server trả về) */
export function groupByProduct(rows: PriceRow[]): Array<{ product: PriceRow['product']; rows: PriceRow[] }> {
  const groups = new Map<string, { product: PriceRow['product']; rows: PriceRow[] }>();
  for (const row of rows) {
    const group = groups.get(row.product.code) ?? { product: row.product, rows: [] };
    group.rows.push(row);
    groups.set(row.product.code, group);
  }
  return [...groups.values()];
}

/** Link gọi điện: bỏ ký tự thừa, giữ số và dấu + */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^0-9+]/g, '')}`;
}

/** Link chỉ đường Google Maps; không có tọa độ thì tìm theo tên + địa chỉ */
export function directionsUrl(shop: Pick<Shop, 'name' | 'address' | 'province_name' | 'lat' | 'lng'>): string {
  const destination =
    shop.lat !== null && shop.lng !== null
      ? `${shop.lat},${shop.lng}`
      : [shop.name, shop.address, shop.province_name].filter(Boolean).join(', ');
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

/** 0.4 -> "400 m", 12.3 -> "12,3 km" */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${(Math.round(km * 10) / 10).toString().replace('.', ',')} km`;
}
