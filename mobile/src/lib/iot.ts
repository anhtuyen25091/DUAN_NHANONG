import { ApiError, createIotApi, parseDeviceFile, type IotAuth } from '@nhanong/shared';
import Constants from 'expo-constants';
import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { getAuth } from './auth';
import { getLastPushToken } from './push';

/**
 * Cảm biến ruộng / ao: máy chủ riêng (dự án iot/), tài khoản riêng (email), độc lập với tài khoản Nhà Nông.
 * Địa chỉ: EXPO_PUBLIC_IOT_URL; khi dev lấy IP máy chạy Metro, cổng 8001 (`php artisan serve --host=0.0.0.0 --port=8001`).
 */
function iotUrl(): string {
  if (process.env.EXPO_PUBLIC_IOT_URL) return process.env.EXPO_PUBLIC_IOT_URL;
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${host ?? 'localhost'}:8001`;
}

/** Trang thiết bị phát khi bấm nút BOOT (firmware esp32-modbus) */
export const DEVICE_FILE_URL = 'http://192.168.4.1/data.csv';

const AUTH_KEY = 'iot_auth';
const PENDING_KEY = 'iot_pending_files';

const store =
  Platform.OS === 'web'
    ? {
        get: (key: string) => localStorage.getItem(key),
        set: (key: string, value: string) => localStorage.setItem(key, value),
        remove: (key: string) => localStorage.removeItem(key),
      }
    : {
        get: (key: string) => Storage.getItemSync(key),
        set: (key: string, value: string) => Storage.setItemSync(key, value),
        remove: (key: string) => Storage.removeItemSync(key),
      };

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = store.get(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

// ---------- Đăng nhập ----------

let auth: IotAuth | null = readJson<IotAuth | null>(AUTH_KEY, null);
const authListeners = new Set<() => void>();

export const iotApi = createIotApi({ baseUrl: iotUrl(), getToken: () => auth?.token ?? null });

export function setIotAuth(next: IotAuth | null) {
  auth = next;
  if (next) store.set(AUTH_KEY, JSON.stringify(next));
  else store.remove(AUTH_KEY);
  authListeners.forEach((l) => l());
}

export function useIotAuth(): IotAuth | null {
  return useSyncExternalStore(
    (listener) => {
      authListeners.add(listener);
      return () => authListeners.delete(listener);
    },
    () => auth,
  );
}

export async function signOutIot() {
  const token = getLastPushToken();
  if (token) await iotApi.removePushToken(token).catch(() => {});
  await iotApi.logout().catch(() => {});
  setIotAuth(null);
}

/** Gắn máy với tài khoản cảm biến để nhận thông báo khi số đo vượt ngưỡng (gọi sau registerPush) */
export async function syncIotPush() {
  const token = getLastPushToken();
  if (!auth || !token || Platform.OS === 'web') return;
  await iotApi.savePushToken(token, Platform.OS === 'ios' ? 'ios' : 'android').catch(() => {});
}

let linkedToken: string | null = null;

/**
 * Đã đăng nhập cả tài khoản Nhà Nông lẫn tài khoản cảm biến: nối 2 tài khoản để dùng chung gói trả phí
 * (có gói Nhà Nông thì xem lượng mưa 1 năm). Mỗi token Nhà Nông chỉ gửi 1 lần mỗi lần mở app.
 */
export async function linkNhanongIfPossible(): Promise<void> {
  const nhanong = getAuth()?.token ?? null;
  if (!auth || !nhanong || nhanong === linkedToken) return;
  linkedToken = nhanong;
  await iotApi.linkNhanong(nhanong).catch(() => {
    // Tài khoản Nhà Nông đã nối với tài khoản cảm biến khác / mất mạng: thử lại lần mở app sau
    linkedToken = null;
  });
}

// ---------- File dữ liệu tải từ thiết bị (ruộng không có mạng) ----------

export interface PendingDeviceFile {
  uid: string;
  rows: number;
  content: string;
  savedAt: string;
}

let pending: PendingDeviceFile[] = readJson<PendingDeviceFile[]>(PENDING_KEY, []);
const pendingListeners = new Set<() => void>();

function savePending(next: PendingDeviceFile[]) {
  pending = next;
  store.set(PENDING_KEY, JSON.stringify(next));
  pendingListeners.forEach((l) => l());
}

export function usePendingDeviceFiles(): PendingDeviceFile[] {
  return useSyncExternalStore(
    (listener) => {
      pendingListeners.add(listener);
      return () => pendingListeners.delete(listener);
    },
    () => pending,
  );
}

/**
 * Điện thoại đang vào WiFi "NHANONG-<mã>" của thiết bị: tải file số đo, lưu lại trên máy.
 * WiFi của thiết bị không có Internet nên chưa gửi được; flushDeviceFiles() gửi khi có mạng.
 */
export async function collectFromDevice(timeoutMs = 20000): Promise<PendingDeviceFile> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let content: string;
  try {
    const response = await fetch(DEVICE_FILE_URL, { signal: controller.signal });
    content = await response.text();
  } catch {
    throw new Error('Không kết nối được thiết bị. Kiểm tra điện thoại đã vào WiFi "NHANONG-…" của thiết bị và đã tắt 4G.');
  } finally {
    clearTimeout(timer);
  }

  const info = parseDeviceFile(content);
  if (!info) throw new Error('Dữ liệu nhận được không phải của thiết bị Nhà Nông.');

  const file: PendingDeviceFile = { ...info, content, savedAt: new Date().toISOString() };
  if (info.rows > 0) savePending([...pending, file]);
  return file;
}

/**
 * Gửi các file đang chờ. File máy chủ đã nhận (kể cả số đo trùng) hoặc từ chối (sai chữ ký) thì bỏ khỏi hàng đợi;
 * lỗi mạng thì giữ lại để lần sau gửi tiếp.
 */
export async function flushDeviceFiles(): Promise<{ sent: number; accepted: number; failed: string | null }> {
  let sent = 0;
  let accepted = 0;
  for (const file of [...pending]) {
    try {
      const result = await iotApi.uploadDeviceFile(file.content);
      accepted += result.accepted;
      sent++;
    } catch (error) {
      if (error instanceof ApiError && (error.status === 0 || error.status >= 500 || error.status === 429)) {
        return { sent, accepted, failed: error.message };
      }
      // 403 / 422: file hỏng, gửi lại cũng vậy
    }
    savePending(pending.filter((p) => p !== file));
  }
  return { sent, accepted, failed: null };
}
