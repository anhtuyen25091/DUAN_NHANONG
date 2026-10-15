import type { AccountUser, AuthResult } from '@nhanong/shared';
import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

/**
 * Tài khoản đang đăng nhập trên máy (để xem lịch sử giá dài hơn).
 * Độc lập với "lưu cả trên mạng" của sổ thu chi, nhưng khi đăng nhập ở sổ thì cũng lưu vào đây.
 */
const KEY = 'auth';

/** shared: token dùng chung với "lưu cả trên mạng" của sổ thu chi (đăng xuất ở đây không hủy token trên server) */
export type StoredAuth = AuthResult & { shared?: boolean };

/** Bản xem trước trên trình duyệt (expo start --web) lưu vào localStorage như sổ thu chi; trên máy dùng kv-store */
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

let current: StoredAuth | null = read();
const listeners = new Set<() => void>();

function read(): StoredAuth | null {
  try {
    const raw = store.get(KEY);
    return raw ? (JSON.parse(raw) as StoredAuth) : null;
  } catch {
    return null;
  }
}

export function setAuth(auth: StoredAuth | null) {
  current = auth;
  try {
    if (auth) store.set(KEY, JSON.stringify(auth));
    else store.remove(KEY);
  } catch {
    // Không lưu được: vẫn dùng được tới khi tắt app
  }
  listeners.forEach((l) => l());
}

/** Cập nhật thông tin tài khoản (mức xem, hạn gói) mà không đổi token */
export function updateAuthUser(user: AccountUser) {
  if (current) setAuth({ ...current, user });
}

export function getAuth(): StoredAuth | null {
  return current;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAuth(): StoredAuth | null {
  return useSyncExternalStore(subscribe, () => current);
}
