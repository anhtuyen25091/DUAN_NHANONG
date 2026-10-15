/**
 * Kiểu dữ liệu và client gọi API /api/v1 của backend, dùng chung cho web và mobile.
 */

export type CategoryType = 'nong_san' | 'phan_bon' | 'thuoc_bvtv';

export const CATEGORY_TYPE_LABELS: Record<CategoryType, string> = {
  nong_san: 'Nông sản',
  phan_bon: 'Phân bón',
  thuoc_bvtv: 'Thuốc BVTV',
};

export interface Product {
  id: number;
  code: string;
  name: string;
  unit: string;
  category?: string;
}

export interface Category {
  id: number;
  slug: string;
  name: string;
  type: CategoryType;
  type_label: string;
  products: Product[];
}

export interface Region {
  id: number;
  code: string;
  name: string;
  province: string | null;
}

export interface PriceRow {
  product: Product;
  region: Region;
  date: string; // YYYY-MM-DD
  price_min: number;
  price_max: number;
  price_avg: number;
  unit: string;
  change: number | null;
  change_percent: number | null;
  previous_date: string | null;
  sources: string[];
}

export interface HistoryPoint {
  date: string;
  min: number;
  max: number;
  avg: number;
}

/** Mức xem lịch sử giá: khách (chưa đăng nhập), đã đăng ký, có gói trả phí */
export type AccessTier = 'guest' | 'member' | 'premium';

export interface PriceHistory {
  product: Product;
  region: Region | null;
  from: string;
  to: string;
  /** Mỗi điểm là 1 ngày, 1 tuần (ngày Thứ 2) hoặc 1 tháng (ngày 1) */
  interval: 'day' | 'week' | 'month';
  points: HistoryPoint[];
  access: {
    tier: AccessTier;
    /** Xem được bao nhiêu ngày gần nhất; null = toàn bộ */
    max_days: number | null;
    /** Khoảng xin xem bị cắt bớt vì mức tài khoản */
    limited: boolean;
    /** Có dữ liệu từ ngày nào */
    first_date: string | null;
  };
}

export interface Plan {
  code: string;
  name: string;
  months: number;
  price: number;
  description: string | null;
}

export interface PlanList {
  data: Plan[];
  limits: { guest_days: number; member_days: number };
}

export type AlertCondition = 'change' | 'above' | 'below';

export const ALERT_CONDITION_LABELS: Record<AlertCondition, string> = {
  change: 'Khi giá thay đổi',
  above: 'Khi giá lên tới',
  below: 'Khi giá xuống tới',
};

export interface PriceAlert {
  id: number;
  product: Product;
  region: Region | null;
  condition: AlertCondition;
  condition_label: string;
  threshold: number | null;
  last_notified_at: string | null;
  created_at: string | null;
}

export interface NewPriceAlert {
  product: string; // code
  region: string | null; // code
  condition: AlertCondition;
  threshold: number | null;
}

export interface PriceFilters {
  type?: CategoryType;
  category?: string;
  region?: string;
  product?: string;
  date?: string;
}

export type ShopType = 'thu_mua' | 'phan_bon' | 'thuoc_bvtv';

export const SHOP_TYPE_LABELS: Record<ShopType, string> = {
  thu_mua: 'Thu mua nông sản',
  phan_bon: 'Bán phân bón',
  thuoc_bvtv: 'Bán thuốc BVTV',
};

export interface Shop {
  id: number;
  name: string;
  types: ShopType[];
  address: string | null;
  province: string | null;
  province_name: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  goods: string | null;
  opening_hours: string | null;
  is_verified: boolean;
  source: string | null;
  /** Chỉ có khi tìm theo vị trí */
  distance_km?: number;
}

export interface Province {
  code: string;
  name: string;
  shops: number;
}

export interface ShopFilters {
  type?: ShopType;
  province?: string;
  q?: string;
  /** Có lat/lng thì lọc theo bán kính (km) và sắp theo khoảng cách */
  lat?: number;
  lng?: number;
  radius?: number;
  page?: number;
}

export interface ShopPage {
  data: Shop[];
  meta: { page: number; has_more: boolean; total: number; radius_km?: number };
}

/** Đề xuất điểm mới, hoặc báo sửa điểm đã có (shop_id) */
export interface ShopSubmission {
  shop_id?: number | null;
  name?: string | null;
  types?: ShopType[];
  address?: string | null;
  province_code?: string | null;
  phone?: string | null;
  goods?: string | null;
  lat?: number | null;
  lng?: number | null;
  note?: string | null;
}

export interface AccountUser {
  id: number;
  name: string;
  phone: string | null;
  tier?: AccessTier;
  /** Hạn gói xem toàn bộ lịch sử giá (YYYY-MM-DD) */
  premium_until?: string | null;
}

export interface AuthResult {
  token: string;
  user: AccountUser;
}

export interface SyncPushRecord {
  tbl: string;
  data: { id: string; updated_at: string; deleted_at: string | null; [key: string]: unknown };
}

export interface SyncPullResult {
  records: Record<string, Array<SyncPushRecord['data']>>;
  version: number;
  has_more: boolean;
}

export class ApiError extends Error {
  /** 0 = không kết nối được */
  readonly status: number;
  /** Lỗi validate theo từng trường (422) */
  readonly errors: Record<string, string[]>;

  constructor(message: string, status: number, errors: Record<string, string[]> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
  }
}

export interface ApiOptions {
  /** Ví dụ http://localhost:8000 (không có /api/v1) */
  baseUrl: string;
  /** uuid của máy, cần cho các API cảnh báo */
  getDeviceId?: () => string | Promise<string>;
  fetch?: typeof fetch;
}

export function createApi({ baseUrl, getDeviceId, fetch: fetchFn = globalThis.fetch.bind(globalThis) }: ApiOptions) {
  const root = `${baseUrl.replace(/\/+$/, '')}/api/v1`;

  async function request<T>(method: string, path: string, options: { query?: object; body?: unknown; device?: boolean; token?: string } = {}): Promise<T> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
    }
    const qs = params.toString();

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    if (options.device) {
      if (!getDeviceId) throw new Error('Chưa cấu hình getDeviceId');
      headers['X-Device-Id'] = await getDeviceId();
    }

    let response: Response;
    try {
      response = await fetchFn(`${root}${path}${qs ? `?${qs}` : ''}`, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    } catch {
      throw new ApiError('Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.', 0);
    }

    if (response.status === 204) return undefined as T;

    const json = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiError(json?.message ?? `Lỗi máy chủ (${response.status})`, response.status, json?.errors ?? {});
    }
    return json as T;
  }

  return {
    categories: () => request<{ data: Category[] }>('GET', '/categories').then((r) => r.data),
    regions: () => request<{ data: Region[] }>('GET', '/regions').then((r) => r.data),
    prices: (filters: PriceFilters = {}) => request<{ data: PriceRow[]; date: string }>('GET', '/prices', { query: filters }),
    /** token: đăng nhập thì xem được lâu hơn (30 ngày / toàn bộ nếu có gói) */
    history: (productCode: string, { token, ...options }: { region?: string | null; days?: number; to?: string; token?: string | null } = {}) =>
      request<PriceHistory>('GET', `/products/${encodeURIComponent(productCode)}/history`, { query: options, token: token ?? undefined }),
    plans: () => request<PlanList>('GET', '/plans'),

    updateDevice: (pushToken: string | null, platform?: 'android' | 'ios' | 'web') =>
      request<{ data: { uuid: string; push_enabled: boolean } }>('PUT', '/device', {
        body: { push_token: pushToken, platform },
        device: true,
      }).then((r) => r.data),
    alerts: () => request<{ data: PriceAlert[] }>('GET', '/alerts', { device: true }).then((r) => r.data),
    createAlert: (alert: NewPriceAlert) =>
      request<{ data: PriceAlert }>('POST', '/alerts', { body: alert, device: true }).then((r) => r.data),
    deleteAlert: (id: number) => request<void>('DELETE', `/alerts/${id}`, { device: true }),

    // ---- Tài khoản + đồng bộ sổ thu chi (token truyền vào từng lần gọi) ----
    register: (input: { name: string; phone: string; password: string; device_name?: string }) =>
      request<AuthResult>('POST', '/auth/register', { body: input }),
    login: (input: { phone: string; password: string; device_name?: string }) => request<AuthResult>('POST', '/auth/login', { body: input }),
    logout: (token: string) => request<void>('POST', '/auth/logout', { token }),
    me: (token: string) => request<{ data: AccountUser }>('GET', '/user', { token }).then((r) => r.data),
    syncPush: (token: string, records: SyncPushRecord[]) =>
      request<{ accepted: number; version: number }>('POST', '/sync/push', { token, body: { records } }),
    syncPull: (token: string, since: number) => request<SyncPullResult>('GET', '/sync/pull', { token, query: { since } }),
    deleteServerLedger: (token: string) => request<void>('DELETE', '/ledger', { token }),

    shops: (filters: ShopFilters = {}) => request<ShopPage>('GET', '/shops', { query: filters }),
    provinces: () => request<{ data: Province[] }>('GET', '/provinces').then((r) => r.data),
    submitShop: (submission: ShopSubmission) =>
      request<{ message: string }>('POST', '/shop-submissions', { body: submission, device: true }).then((r) => r.message),
  };
}

export type Api = ReturnType<typeof createApi>;

/** uuid v4 cho X-Device-Id (không phụ thuộc crypto.randomUUID vì React Native có thể không có) */
export function randomUuid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
