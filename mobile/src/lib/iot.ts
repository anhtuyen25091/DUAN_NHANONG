import { ApiError, createIotApi, parseDeviceFile, type IotAuth } from '@nhanong/shared';
import Constants from 'expo-constants';
import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { getAuth, subscribeAuth } from './auth';
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

/** kv-store trên máy (web: localStorage) */
export const iotStore =
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
    const raw = iotStore.get(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

// ---------- Đăng nhập ----------

let auth: IotAuth | null = readJson<IotAuth | null>(AUTH_KEY, null);
const authListeners = new Set<() => void>();

export const iotApi = createIotApi({ baseUrl: iotUrl(), getToken: () => auth?.token ?? null, onUnauthorized: dropStaleToken });

/** Token cảm biến trên máy bị máy chủ từ chối: bỏ đi, đang đăng nhập Nhà Nông thì vào lại Cảm biến bằng tài khoản đó */
function dropStaleToken(token: string) {
  if (auth?.token !== token) return;
  setIotAuth(null);
  syncedToken = null;
  if (getAuth()) void syncIotWithNhanong().catch(() => {});
}

export function setIotAuth(next: IotAuth | null) {
  auth = next;
  if (next) iotStore.set(AUTH_KEY, JSON.stringify(next));
  else iotStore.remove(AUTH_KEY);
  authListeners.forEach((l) => l());
}

export function getIotAuth(): IotAuth | null {
  return auth;
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

let syncedToken: string | null = null;
let syncing: Promise<boolean> | null = null;

/**
 * Cho mục Cảm biến theo tài khoản Nhà Nông đang đăng nhập (dùng chung tài khoản, gói trả phí):
 * - chưa vào Cảm biến, hoặc đang vào bằng tài khoản Nhà Nông khác: đăng nhập lại bằng token Nhà Nông
 * - đang dùng tài khoản email cũ chưa nối: nối với tài khoản Nhà Nông (giữ trang trại cũ)
 * - đăng xuất Nhà Nông: thoát luôn Cảm biến (trừ tài khoản email chưa nối)
 * Trả true khi vừa đăng nhập mới (để hỏi quyền thông báo). Lỗi thì ném ra để màn hình hiện nút thử lại.
 */
export function syncIotWithNhanong(): Promise<boolean> {
  syncing ??= run().finally(() => {
    syncing = null;
  });
  return syncing;
}

async function run(): Promise<boolean> {
  const nhanong = getAuth();
  if (!nhanong) {
    syncedToken = null;
    if (auth?.user.nhanong_user_id) await signOutIot();
    return false;
  }
  if (nhanong.token === syncedToken && auth) return false;
  let signedIn = false;
  const signIn = async () => {
    setIotAuth(await iotApi.loginNhanong(nhanong.token));
    signedIn = true;
  };
  // 422: tài khoản Nhà Nông đã nối với tài khoản cảm biến khác → theo tài khoản Nhà Nông
  // 401: token cảm biến trên máy không còn trên máy chủ → đăng nhập lại bằng tài khoản Nhà Nông
  const signInInstead = (error: unknown) => {
    if (!(error instanceof ApiError) || (error.status !== 422 && error.status !== 401)) throw error;
    return signIn();
  };
  if (auth && auth.user.nhanong_user_id == null) {
    const before = auth;
    await iotApi.linkNhanong(nhanong.token).then(
      () => setIotAuth({ ...before, user: { ...before.user, nhanong_user_id: nhanong.user.id } }),
      signInInstead,
    );
  } else if (auth && auth.user.nhanong_user_id === nhanong.user.id) {
    // Cùng người: gửi token mới để máy chủ cảm biến biết gói đang dùng
    await iotApi.linkNhanong(nhanong.token).catch(signInInstead);
  } else {
    await signIn();
  }
  syncedToken = nhanong.token;
  return signedIn;
}

subscribeAuth(() => {
  void syncIotWithNhanong().catch(() => {});
});

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
  iotStore.set(PENDING_KEY, JSON.stringify(next));
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
