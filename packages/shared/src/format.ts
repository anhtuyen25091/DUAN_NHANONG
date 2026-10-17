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

export interface ProductSummary {
  /** Giá thấp nhất / cao nhất trong các vùng */
  min: number;
  max: number;
  /** Số vùng giá tăng / giảm / không đổi so với lần trước */
  up: number;
  down: number;
  flat: number;
  /** Thay đổi điển hình (trung vị các vùng có thay đổi), để hiện 1 mũi tên chung */
  change: number | null;
  /** Ngày giá mới nhất */
  date: string;
  sources: string[];
}

/** Tóm tắt 1 mặt hàng cho thẻ thu gọn trên bảng giá: khoảng giá, xu hướng chung, ngày, nguồn */
export function summarizeProduct(rows: PriceRow[]): ProductSummary {
  const changes = rows.map((r) => r.change).filter((c): c is number => c !== null);
  const moved = changes.filter((c) => c !== 0).sort((a, b) => a - b);
  return {
    min: Math.min(...rows.map((r) => r.price_min)),
    max: Math.max(...rows.map((r) => r.price_max)),
    up: changes.filter((c) => c > 0).length,
    down: changes.filter((c) => c < 0).length,
    flat: changes.filter((c) => c === 0).length,
    change: changes.length === 0 ? null : moved.length === 0 ? 0 : moved[Math.floor(moved.length / 2)],
    date: rows.map((r) => r.date).sort().at(-1) ?? '',
    sources: [...new Set(rows.flatMap((r) => r.sources))],
  };
}

/** Mặt hàng đang theo dõi lên đầu (theo thứ tự đã chọn), còn lại giữ thứ tự cũ */
export function pinFollowed<T extends { product: { code: string } }>(groups: T[], followed: string[]): T[] {
  const rank = (code: string) => {
    const i = followed.indexOf(code);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return groups.map((g, i) => ({ g, i })).sort((a, b) => rank(a.g.product.code) - rank(b.g.product.code) || a.i - b.i).map((x) => x.g);
}

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** "Hôm nay", "Hôm qua", hoặc ngày tháng */
export function relativeDay(date: string, todayIso = isoDay(new Date())): string {
  if (date === todayIso) return 'Hôm nay';
  const d = new Date(`${todayIso}T00:00:00`);
  d.setDate(d.getDate() - 1);
  const yesterday = isoDay(d);
  return date === yesterday ? 'Hôm qua' : formatDate(date);
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

/** "YYYY-MM-DD" cộng thêm `days` ngày (âm = lùi lại), tính theo lịch, không lệch múi giờ */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/**
 * Các ô của lịch 1 tháng, tuần bắt đầu từ Thứ 2 như lịch treo tường ở Việt Nam.
 * Mỗi ô là số ngày, null là ô trống đầu/cuối tháng; số ô luôn chia hết cho 7.
 */
export function calendarCells(year: number, month: number): Array<number | null> {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0 = CN
  const lead = (first + 6) % 7;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: Array<number | null> = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  return cells;
}

export interface Page<T> {
  items: T[];
  /** Trang đang xem (từ 1), đã kẹp trong khoảng hợp lệ */
  page: number;
  pages: number;
  total: number;
}

/** Cắt danh sách theo trang; trang ngoài khoảng (vd sau khi xóa bớt) tự lùi về trang cuối */
export function paginate<T>(items: T[], page: number, perPage: number): Page<T> {
  const pages = Math.max(1, Math.ceil(items.length / perPage));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  return { items: items.slice((current - 1) * perPage, current * perPage), page: current, pages, total: items.length };
}
