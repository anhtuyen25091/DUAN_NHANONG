/**
 * Kiểu dữ liệu và client gọi API /api/v1 của backend, dùng chung cho web và mobile.
 */
import type { BuyerProfile, BuyerProfileInput, BuyerReport, BuyerStatus, LocalPriceFilters, LocalPrices, MyLocation, Place } from './local';
import type { AdvanceInput, Business, BusinessActivity, BusinessAdvance, BusinessDeal, BusinessInput, BusinessMemberInfo, BusinessSummary, MemberCash, MemberInput } from './business';
import { documentPath, type CustomerInput, type DocumentFormat, type DocumentTarget, type Purchase, type PurchaseInput, type ReceivedPurchase, type TradeCustomer, type TradeFilters, type TradeList, type TradeSummary } from './trade';

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

// ---- Đơn mua bán chung 2 bên (thương lái / chi nhánh / nông dân) ----

export type DealRole = 'seller' | 'buyer';
export type DealEntryKind = 'deposit' | 'cut' | 'payment' | 'cost';
export type DealEntryStatus = 'pending' | 'confirmed' | 'disputed' | 'private';

export interface DealLine {
  grade: string;
  kg: number;
  price: number;
}

export interface DealEntry {
  uuid: string;
  kind: DealEntryKind;
  date: string;
  lines: DealLine[] | null;
  amount: number;
  kg: number;
  deposit_deduct: number;
  paid: number;
  note: string | null;
  status: DealEntryStatus;
  /** Mục do mình ghi */
  mine: boolean;
  created_by_name: string | null;
  dispute_reason: string | null;
  responded_at: string | null;
  updated_at: string;
}

export interface DealTotals {
  delivered: number;
  kg: number;
  deposit: number;
  deducted: number;
  deposit_left: number;
  paid: number;
  /** > 0: bên mua còn nợ bên bán; < 0: bên bán nhận dư */
  balance: number;
}

export interface DealLot {
  revenue: number;
  sell_kg: number;
  buy_cost: number;
  buy_kg: number;
  costs: number;
  profit: number;
  kg_loss: number;
  sources: number;
}

export interface Deal {
  uuid: string;
  /** Mã để bên kia tham gia */
  code: string;
  title: string;
  unit: string;
  product: { code: string; name: string } | null;
  status: 'open' | 'done' | 'cancelled';
  closed_at: string | null;
  note: string | null;
  my_role: DealRole;
  is_creator: boolean;
  /** Chủ doanh nghiệp đang xem đơn của lái (nhìn từ phía lái, không ghi / sửa được) */
  read_only?: boolean;
  /** Tên lái khi chủ đang xem */
  viewing_as?: string | null;
  /** Bên kia đã tham gia */
  joined: boolean;
  seller_name: string | null;
  buyer_name: string | null;
  counterpart: { name: string; phone: string | null } | null;
  summary: {
    confirmed: DealTotals;
    /** Nếu bên kia đồng ý hết các mục đang chờ */
    with_pending: DealTotals;
    /** Mục bên kia ghi, chờ mình xác nhận */
    awaiting_me: number;
    awaiting_other: number;
    disputed: number;
  };
  /** Lời cả lô (chỉ bên bán thấy, khi đã gộp đơn mua) */
  lot: DealLot | null;
  sources?: Array<{ uuid: string; title: string; seller_name: string | null }>;
  /** Có ở API chi tiết, không có ở danh sách */
  entries?: DealEntry[];
  /** Việc mới nhất trên đơn ("Chú Ba đồng ý Đợt cân …"); by_me = do mình làm */
  last_activity: { text: string; by_me: boolean; at: string | null } | null;
  updated_at: string;
}

export interface NewDeal {
  role: DealRole;
  title: string;
  counterpart_name?: string | null;
  product_code?: string | null;
  unit?: string;
  note?: string | null;
  deposit?: number;
  deposit_date?: string;
}

export interface DealEntryInput {
  kind?: DealEntryKind;
  date: string;
  lines?: DealLine[];
  amount?: number;
  deposit_deduct?: number;
  paid?: number;
  note?: string | null;
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
  /** Khu vực của tôi đã lưu vào tài khoản */
  location?: MyLocation | null;
  /** Trạng thái hồ sơ điểm mua (nếu có) */
  buyer_status?: BuyerStatus | null;
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

    /** since: chỉ lấy đơn thay đổi từ thời điểm đó (hỏi định kỳ để báo bên kia vừa ghi / xác nhận) */
    deals: (token: string, since?: string) => request<{ data: Deal[] }>('GET', '/deals', { token, query: since ? { since } : {} }).then((r) => r.data),
    deal: (token: string, uuid: string) => request<{ data: Deal }>('GET', `/deals/${uuid}`, { token }).then((r) => r.data),
    createDeal: (token: string, deal: NewDeal) => request<{ data: Deal }>('POST', '/deals', { token, body: deal }).then((r) => r.data),
    updateDeal: (token: string, uuid: string, patch: { title?: string; note?: string | null; counterpart_name?: string | null; status?: Deal['status'] }) =>
      request<{ data: Deal }>('PATCH', `/deals/${uuid}`, { token, body: patch }).then((r) => r.data),
    deleteDeal: (token: string, uuid: string) => request<void>('DELETE', `/deals/${uuid}`, { token }),
    joinDeal: (token: string, code: string) => request<{ data: Deal }>('POST', '/deals/join', { token, body: { code } }).then((r) => r.data),
    setDealSources: (token: string, uuid: string, buyDeals: string[]) =>
      request<{ data: Deal }>('PUT', `/deals/${uuid}/sources`, { token, body: { buy_deals: buyDeals } }).then((r) => r.data),
    addDealEntry: (token: string, uuid: string, entry: DealEntryInput) =>
      request<{ data: Deal }>('POST', `/deals/${uuid}/entries`, { token, body: entry }).then((r) => r.data),
    updateDealEntry: (token: string, entryUuid: string, entry: DealEntryInput) =>
      request<{ data: Deal }>('PATCH', `/deal-entries/${entryUuid}`, { token, body: entry }).then((r) => r.data),
    deleteDealEntry: (token: string, entryUuid: string) => request<{ data: Deal }>('DELETE', `/deal-entries/${entryUuid}`, { token }).then((r) => r.data),
    confirmDealEntry: (token: string, entryUuid: string) => request<{ data: Deal }>('POST', `/deal-entries/${entryUuid}/confirm`, { token }).then((r) => r.data),
    disputeDealEntry: (token: string, entryUuid: string, reason: string) =>
      request<{ data: Deal }>('POST', `/deal-entries/${entryUuid}/dispute`, { token, body: { reason } }).then((r) => r.data),

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

    // ---- Giá theo khu vực (điểm mua đóng góp) ----
    localPrices: (filters: LocalPriceFilters) => request<LocalPrices>('GET', '/local-prices', { query: filters }),
    flagLocalPrice: (id: number, reason?: string) =>
      request<{ message: string }>('POST', `/local-prices/${id}/flag`, { body: { reason: reason ?? null }, device: true }).then((r) => r.message),
    places: (q: string, province?: string | null) => request<{ data: Place[] }>('GET', '/places', { query: { q, province: province || undefined } }).then((r) => r.data),
    saveMyLocation: (token: string, location: Pick<MyLocation, 'province' | 'label' | 'radius'> & { lat?: number | null; lng?: number | null }) =>
      request<{ data: MyLocation }>('PUT', '/me/location', { token, body: location }).then((r) => r.data),
    myBuyer: (token: string) => request<{ data: BuyerProfile | null }>('GET', '/me/buyer', { token }).then((r) => r.data),
    saveBuyer: (token: string, profile: BuyerProfileInput) =>
      request<{ data: BuyerProfile; message?: string }>('PUT', '/me/buyer', { token, body: profile }),
    myBuyerPrices: (token: string) => request<{ data: BuyerReport[] }>('GET', '/me/buyer/prices', { token }).then((r) => r.data),
    postBuyerPrice: (token: string, input: { product: string; price: number; date?: string; note?: string | null }) =>
      request<{ data: BuyerReport; message: string }>('POST', '/me/buyer/prices', { token, body: input }),
    deleteBuyerPrice: (token: string, id: number) => request<void>('DELETE', `/me/buyer/prices/${id}`, { token }),

    // ---- Sổ giao dịch (điểm thu mua / thương lái) ----
    customers: (token: string, q?: string) => request<{ data: TradeCustomer[] }>('GET', '/customers', { token, query: { q } }).then((r) => r.data),
    saveCustomer: (token: string, input: CustomerInput, id?: string) =>
      request<{ data: TradeCustomer }>(id ? 'PATCH' : 'POST', id ? `/customers/${id}` : '/customers', { token, body: input }).then((r) => r.data),
    deleteCustomer: (token: string, id: string) => request<void>('DELETE', `/customers/${id}`, { token }),
    transactions: (token: string, filters: TradeFilters = {}) => request<TradeList>('GET', '/transactions', { token, query: filters }),
    tradeSummary: (token: string, range: { from?: string; to?: string } = {}) =>
      request<{ data: TradeSummary }>('GET', '/transactions/summary', { token, query: range }).then((r) => r.data),
    purchase: (token: string, id: string) => request<{ data: Purchase }>('GET', `/purchases/${id}`, { token }).then((r) => r.data),
    savePurchase: (token: string, input: PurchaseInput, id?: string) =>
      request<{ data: Purchase }>(id ? 'PATCH' : 'POST', id ? `/purchases/${id}` : '/purchases', { token, body: input }).then((r) => r.data),
    deletePurchase: (token: string, id: string) => request<void>('DELETE', `/purchases/${id}`, { token }),
    /** Tạo (hoặc lấy lại) mã chia sẻ phiếu cho khách */
    sharePurchase: (token: string, id: string) => request<{ data: Purchase }>('POST', `/purchases/${id}/share`, { token }).then((r) => r.data),
    unsharePurchase: (token: string, id: string) => request<{ data: Purchase }>('DELETE', `/purchases/${id}/share`, { token }).then((r) => r.data),
    /** Gửi thẳng vào app của khách (SĐT khách trùng tài khoản) */
    sendPurchase: (token: string, id: string) => request<{ data: Purchase; message: string }>('POST', `/purchases/${id}/send`, { token }),
    /** Khách nhập mã để nhận phiếu */
    receivePurchase: (token: string, code: string) => request<{ data: ReceivedPurchase }>('POST', '/received-purchases', { token, body: { code } }).then((r) => r.data),
    /** since: chỉ lấy phiếu mới đổi / mới được gửi sau thời điểm đó */
    receivedPurchases: (token: string, since?: string) =>
      request<{ data: ReceivedPurchase[] }>('GET', '/received-purchases', { token, query: since ? { since } : {} }).then((r) => r.data),
    receivedPurchase: (token: string, id: string) => request<{ data: ReceivedPurchase }>('GET', `/received-purchases/${id}`, { token }).then((r) => r.data),
    /** Tải giấy tờ PDF / Word: trả nội dung file + tên file (web lưu bằng Blob, app ghi file rồi chia sẻ) */
    downloadDocument: async (token: string, target: DocumentTarget, format: DocumentFormat): Promise<{ data: ArrayBuffer; filename: string; mime: string }> => {
      let response: Response;
      try {
        response = await fetchFn(`${root}${documentPath(target, format)}`, { headers: { Authorization: `Bearer ${token}`, Accept: '*/*' } });
      } catch {
        throw new ApiError('Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.', 0);
      }
      if (!response.ok) {
        const json = await response.json().catch(() => null);
        throw new ApiError(json?.message ?? `Lỗi máy chủ (${response.status})`, response.status);
      }
      const filename = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? `giay-to.${format}`;
      return { data: await response.arrayBuffer(), filename, mime: response.headers.get('Content-Type') ?? 'application/octet-stream' };
    },

    // ---- Doanh nghiệp thu mua (chủ + lái con) ----
    business: (token: string) => request<{ data: Business | null }>('GET', '/business', { token }).then((r) => r.data),
    createBusiness: (token: string, input: BusinessInput) => request<{ data: Business }>('POST', '/business', { token, body: input }).then((r) => r.data),
    updateBusiness: (token: string, input: BusinessInput) => request<{ data: Business }>('PATCH', '/business', { token, body: input }).then((r) => r.data),
    createMember: (token: string, input: MemberInput) => request<{ data: BusinessMemberInfo }>('POST', '/business/members', { token, body: input }).then((r) => r.data),
    updateMember: (token: string, id: number, input: { group_name?: string | null; status?: 'active' | 'locked'; password?: string }) =>
      request<{ data: BusinessMemberInfo }>('PATCH', `/business/members/${id}`, { token, body: input }).then((r) => r.data),
    removeMember: (token: string, id: number) => request<void>('DELETE', `/business/members/${id}`, { token }),
    businessInvite: (token: string) => request<{ data: Business }>('POST', '/business/invite', { token }).then((r) => r.data),
    revokeBusinessInvite: (token: string) => request<{ data: Business }>('DELETE', '/business/invite', { token }).then((r) => r.data),
    joinBusiness: (token: string, code: string) => request<{ data: Business }>('POST', '/business/join', { token, body: { code } }).then((r) => r.data),
    leaveBusiness: (token: string) => request<void>('POST', '/business/leave', { token }),
    businessSummary: (token: string, range: { from?: string; to?: string } = {}) =>
      request<{ data: BusinessSummary; meta: { from: string; to: string } }>('GET', '/business/summary', { token, query: range }),
    businessTransactions: (token: string, filters: TradeFilters & { member?: number } = {}) => request<TradeList>('GET', '/business/transactions', { token, query: filters }),
    /** Chủ doanh nghiệp: việc mới của các lái từ thời điểm since (không phải chủ: rỗng) */
    businessActivity: (token: string, since?: string) =>
      request<{ data: BusinessActivity[] }>('GET', '/business/activity', { token, query: since ? { since } : {} }).then((r) => r.data),
    businessDeals: (token: string) => request<{ data: BusinessDeal[] }>('GET', '/business/deals', { token }).then((r) => r.data),
    businessAdvances: (token: string, member?: number) =>
      request<{ data: BusinessAdvance[]; cash: MemberCash | null }>('GET', '/business/advances', { token, query: { member } }),
    createAdvance: (token: string, input: AdvanceInput) => request<{ data: BusinessAdvance; cash: MemberCash }>('POST', '/business/advances', { token, body: input }),
    deleteAdvance: (token: string, id: string) => request<void>('DELETE', `/business/advances/${id}`, { token }),

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
