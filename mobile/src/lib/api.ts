import { createApi, randomUuid } from '@nhanong/shared';
import Constants from 'expo-constants';
import Storage from 'expo-sqlite/kv-store';

const DEVICE_KEY = 'device_id';

/**
 * Địa chỉ backend: EXPO_PUBLIC_API_URL nếu có; khi dev thì lấy IP máy đang chạy Metro, cổng 8000
 * (chạy Laravel bằng `php artisan serve --host=0.0.0.0`).
 */
function apiUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${host ?? 'localhost'}:8000`;
}

/** uuid ngẫu nhiên của máy, sinh 1 lần rồi lưu lại (không chứa thông tin cá nhân) */
export function deviceId(): string {
  let id = Storage.getItemSync(DEVICE_KEY);
  if (!id) {
    id = randomUuid();
    Storage.setItemSync(DEVICE_KEY, id);
  }
  return id;
}

export const api = createApi({ baseUrl: apiUrl(), getDeviceId: deviceId });
