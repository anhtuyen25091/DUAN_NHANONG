import { ApiError } from './api';
import { formatNumber } from './format';

/**
 * Hệ thống cảm biến ruộng / ao (dự án iot/, máy chủ riêng, tài khoản riêng).
 */

export type IotPlotType = 'field' | 'garden' | 'pond' | 'greenhouse' | 'other';
export type IotStatus = 'ok' | 'below' | 'above' | null;
export type IotInterval = 'raw' | 'hour' | 'day';

export interface IotUser {
  id: number;
  name: string;
  email: string;
}

export interface IotAuth {
  token: string;
  user: IotUser;
}

export interface IotPlot {
  id: number;
  farm_id: number;
  name: string;
  type: IotPlotType;
  type_label: string;
  crop: string | null;
  area_m2: number | null;
}

export interface IotFarm {
  id: number;
  name: string;
  province: string | null;
  lat: number | null;
  lng: number | null;
  /** Báo khi trời bắt đầu mưa tại vị trí trang trại */
  rain_alerts: boolean;
  /** Đang mưa (dữ liệu thời tiết hoặc máy đo mưa): từ lúc nào, khoảng bao nhiêu mm */
  raining: { since: string; mm: number } | null;
  plots: IotPlot[];
}

export interface IotFarmInput {
  name: string;
  province: string | null;
  lat: number | null;
  lng: number | null;
  rain_alerts?: boolean;
}

/** Gói dùng chung với tài khoản Nhà Nông đã nối */
export interface IotPlan {
  linked: boolean;
  phone: string | null;
  premium: boolean;
  premium_until: string | null;
  rain_history_days: number;
}

export interface IotRainfall {
  days: number;
  max_days: number;
  /** Muốn xem nhiều ngày hơn gói cho phép */
  locked: boolean;
  plan: IotPlan;
  total_mm: number;
  rainy_days: number;
  has_gauge: boolean;
  /** rain_mm: dữ liệu thời tiết (null: chưa có số liệu); gauge_mm: máy đo mưa của trang trại */
  data: { date: string; rain_mm: number | null; gauge_mm: number | null }[];
}

export interface IotPlotInput {
  name: string;
  type: IotPlotType;
  crop: string | null;
  area_m2: number | null;
}

export interface IotDeviceInput {
  farm_id: number;
  plot_id: number | null;
  name: string;
  kind: 'esp32' | 'lorawan';
  profile: string | null;
  dev_eui: string | null;
}

export interface IotDeviceProfile {
  code: string;
  metrics: string[];
}

export interface IotMetric {
  code: string;
  name: string;
  unit: string | null;
  group: 'soil' | 'water' | 'weather' | 'device';
  decimals: number;
}

export interface IotThreshold {
  id: number;
  plot_id: number;
  metric: string;
  min: number | null;
  max: number | null;
  note: string | null;
}

export interface IotWeatherDay {
  date: string;
  code: number;
  label: string;
  icon: string;
  temp_max: number;
  temp_min: number;
  rain_mm: number;
  rain_chance: number | null;
  wind_max: number;
}

export interface IotWeather {
  daily: IotWeatherDay[];
  next_24h: { rain_mm: number; rain_chance: number };
  hints: string[];
}

export interface IotDevice {
  id: number;
  uid: string;
  farm_id: number;
  plot_id: number | null;
  name: string;
  kind: 'esp32' | 'lorawan';
  profile: string;
  dev_eui: string | null;
  battery: number | null;
  online: boolean;
  last_seen_at: string | null;
}

export interface IotMetricRef {
  code: string;
  name: string;
  unit: string | null;
}

export interface IotReading {
  metric: IotMetricRef;
  value: number;
  measured_at: string;
  device_id: number;
  device_name: string;
  status: IotStatus;
  min: number | null;
  max: number | null;
}

export interface IotAlert {
  id: number;
  plot: { id: number; name: string };
  device: { id: number; name: string };
  metric: IotMetricRef & { group: string; decimals: number };
  direction: 'below' | 'above';
  value: number;
  min: number | null;
  max: number | null;
  measured_at: string;
  resolved_at: string | null;
}

export interface IotPlotSummary {
  plot: IotPlot;
  devices: IotDevice[];
  readings: IotReading[];
  open_alerts: IotAlert[];
}

export type IotPoint = { t: string; value: number } | { t: string; min: number; max: number; avg: number; count: number };

export interface IotHistory {
  metric: IotMetricRef;
  interval: IotInterval;
  from: string;
  to: string;
  data: IotPoint[];
}

export interface IotIngestResult {
  device?: string;
  accepted: number;
  duplicates: number;
  rejected: { index: number; reason: string }[];
}

export interface IotApiOptions {
  /** Ví dụ http://localhost:8001 (không có /api/v1) */
  baseUrl: string;
  getToken: () => string | null;
  fetch?: typeof fetch;
}

export function createIotApi({ baseUrl, getToken, fetch: fetchFn = globalThis.fetch.bind(globalThis) }: IotApiOptions) {
  const root = `${baseUrl.replace(/\/+$/, '')}/api/v1`;

  async function request<T>(method: string, path: string, options: { query?: object; body?: unknown } = {}): Promise<T> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
    }
    const qs = params.toString();

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    let response: Response;
    try {
      response = await fetchFn(`${root}${path}${qs ? `?${qs}` : ''}`, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    } catch {
      throw new ApiError('Không kết nối được máy chủ cảm biến. Kiểm tra mạng rồi thử lại.', 0);
    }

    if (response.status === 204) return undefined as T;
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiError(json?.message ?? `Lỗi máy chủ (${response.status})`, response.status, json?.errors ?? {});
    }
    return json as T;
  }

  return {
    login: (email: string, password: string) => request<IotAuth>('POST', '/auth/login', { body: { email, password, device_name: 'app' } }),
    register: (name: string, email: string, password: string) =>
      request<IotAuth>('POST', '/auth/register', { body: { name, email, password, device_name: 'app' } }),
    logout: () => request<void>('POST', '/auth/logout'),
    me: () => request<{ data: IotUser & { plan: IotPlan } }>('GET', '/me').then((r) => r.data),
    /** Nối tài khoản Nhà Nông (token đăng nhập của app Nhà Nông) để dùng chung gói trả phí */
    linkNhanong: (token: string) => request<{ data: IotPlan }>('PUT', '/me/nhanong', { body: { token } }).then((r) => r.data),
    unlinkNhanong: () => request<{ data: IotPlan }>('DELETE', '/me/nhanong').then((r) => r.data),
    rainfall: (farmId: number, days: number) => request<IotRainfall>('GET', `/farms/${farmId}/rainfall`, { query: { days } }),
    farms: () => request<{ data: IotFarm[] }>('GET', '/farms').then((r) => r.data),
    createFarm: (input: IotFarmInput) => request<{ data: IotFarm }>('POST', '/farms', { body: input }).then((r) => r.data),
    updateFarm: (id: number, input: IotFarmInput) => request<{ data: IotFarm }>('PUT', `/farms/${id}`, { body: input }).then((r) => r.data),
    deleteFarm: (id: number) => request<void>('DELETE', `/farms/${id}`),
    weather: (farmId: number) => request<{ data: IotWeather }>('GET', `/farms/${farmId}/weather`).then((r) => r.data),
    createPlot: (farmId: number, input: IotPlotInput) => request<{ data: IotPlot }>('POST', `/farms/${farmId}/plots`, { body: input }).then((r) => r.data),
    updatePlot: (id: number, input: IotPlotInput) => request<{ data: IotPlot }>('PUT', `/plots/${id}`, { body: input }).then((r) => r.data),
    deletePlot: (id: number) => request<void>('DELETE', `/plots/${id}`),
    devices: () => request<{ data: IotDevice[] }>('GET', '/devices').then((r) => r.data),
    deviceProfiles: () => request<{ data: IotDeviceProfile[] }>('GET', '/device-profiles').then((r) => r.data),
    /** Tạo thiết bị; api_key (ESP32 nạp vào firmware) chỉ trả về đúng lần này */
    createDevice: (input: IotDeviceInput) => request<{ data: IotDevice; api_key: string }>('POST', '/devices', { body: input }),
    updateDevice: (id: number, input: IotDeviceInput) => request<{ data: IotDevice }>('PUT', `/devices/${id}`, { body: input }).then((r) => r.data),
    deleteDevice: (id: number) => request<void>('DELETE', `/devices/${id}`),
    rotateDeviceKey: (id: number) => request<{ data: IotDevice; api_key: string }>('POST', `/devices/${id}/rotate-key`),
    metrics: () => request<{ data: IotMetric[] }>('GET', '/metrics').then((r) => r.data),
    thresholds: (plotId: number) => request<{ data: IotThreshold[] }>('GET', `/plots/${plotId}/thresholds`).then((r) => r.data),
    saveThreshold: (plotId: number, input: { metric: string; min: number | null; max: number | null; note: string | null }) =>
      request<{ data: IotThreshold }>('POST', `/plots/${plotId}/thresholds`, { body: input }).then((r) => r.data),
    deleteThreshold: (id: number) => request<void>('DELETE', `/thresholds/${id}`),
    plotSummary: (plotId: number) => request<{ data: IotPlotSummary }>('GET', `/plots/${plotId}/summary`).then((r) => r.data),
    readings: (deviceId: number, query: { metric: string; from?: string; to?: string; interval?: IotInterval }) =>
      request<IotHistory>('GET', `/devices/${deviceId}/readings`, { query }),
    alerts: (open = false) => request<{ data: IotAlert[] }>('GET', '/alerts', { query: { open: open ? 1 : undefined } }).then((r) => r.data),
    resolveAlert: (alertId: number) => request<{ data: IotAlert }>('POST', `/alerts/${alertId}/resolve`).then((r) => r.data),
    savePushToken: (token: string, platform: 'android' | 'ios') => request<void>('PUT', '/me/push-token', { body: { token, platform } }),
    removePushToken: (token: string) => request<void>('DELETE', '/me/push-token', { body: { token } }),
    /** File dữ liệu tải từ thiết bị ở ruộng không có mạng (có chữ ký, không cần đăng nhập) */
    uploadDeviceFile: (content: string) => request<IotIngestResult>('POST', '/ingest/upload', { body: { content } }),
  };
}

export type IotApi = ReturnType<typeof createIotApi>;

/**
 * File thiết bị phát ra (http://192.168.4.1/data.csv): dòng đầu "#nhanong uid=<mã> sig=<64 hex>", sau đó mỗi dòng 1 số đo.
 * Trả về mã thiết bị và số dòng số đo, hoặc null nếu không phải file của thiết bị Nhà Nông.
 */
export function parseDeviceFile(content: string): { uid: string; rows: number } | null {
  const normalized = content.replace(/\r\n/g, '\n');
  const newline = normalized.indexOf('\n');
  const header = newline < 0 ? normalized : normalized.slice(0, newline);
  const match = /^#nhanong uid=(\w+) sig=[0-9a-f]{64}\s*$/.exec(header);
  if (!match) return null;
  const body = newline < 0 ? '' : normalized.slice(newline + 1);
  const rows = body.split('\n').filter((line) => line.trim() !== '' && !line.startsWith('#')).length;
  return { uid: match[1], rows };
}

/** 6.25 -> "6,25", 12500 -> "12.500" (tối đa 2 chữ số thập phân; tự ghép, không phụ thuộc Intl của máy) */
export function formatDecimal(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const [integer, fraction] = Math.abs(rounded).toString().split('.');
  return `${rounded < 0 ? '-' : ''}${formatNumber(Number(integer))}${fraction ? `,${fraction}` : ''}`;
}

/** Giá trị + đơn vị: "6,4", "43,3 %", "4,6 ‰" */
export function formatIotValue(value: number, unit: string | null): string {
  const text = formatDecimal(value);
  return unit ? `${text} ${unit}` : text;
}

/** "Ngưỡng 7,5 – 8,5", "Ngưỡng ≤ 4", null nếu chưa đặt ngưỡng */
export function thresholdLabel(min: number | null, max: number | null): string | null {
  const n = formatDecimal;
  if (min !== null && max !== null) return `Ngưỡng ${n(min)} – ${n(max)}`;
  if (min !== null) return `Ngưỡng ≥ ${n(min)}`;
  if (max !== null) return `Ngưỡng ≤ ${n(max)}`;
  return null;
}

/** "vừa xong", "15 phút trước", "3 giờ trước", "2 ngày trước" */
export function timeAgo(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (minutes < 2) return 'vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.round(hours / 24)} ngày trước`;
}

/** Ô nhập số kiểu Việt Nam ("7,5") -> số; trống -> null; sai -> NaN */
export function parseDecimalInput(text: string): number | null {
  const trimmed = text.trim().replace(/\s/g, '');
  if (trimmed === '') return null;
  const normalized = trimmed.includes(',') ? trimmed.replace(/\./g, '').replace(',', '.') : trimmed;
  return /^-?\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : NaN;
}

/** DevEUI in trên nhãn thường có dấu ":" / "-" / khoảng trắng: bỏ đi, viết thường */
export function normalizeDevEui(text: string): string {
  return text.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
}

/** "Thứ bảy 1/11" cho dòng dự báo; ngày đầu là "Hôm nay" */
export function weatherDayLabel(date: string, index: number): string {
  if (index === 0) return 'Hôm nay';
  if (index === 1) return 'Ngày mai';
  const d = new Date(`${date}T00:00:00`);
  const weekdays = ['CN', 'Th 2', 'Th 3', 'Th 4', 'Th 5', 'Th 6', 'Th 7'];
  return `${weekdays[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

/** Lượng mưa 1 ngày: ưu tiên máy đo mưa của trang trại, không có thì dữ liệu thời tiết */
export function rainOfDay(day: IotRainfall['data'][number]): number | null {
  return day.gauge_mm ?? day.rain_mm;
}

/** Điểm biểu đồ: giá trị chính (trung bình nếu đã gộp) */
export function pointValue(point: IotPoint): number {
  return 'avg' in point ? point.avg : point.value;
}
