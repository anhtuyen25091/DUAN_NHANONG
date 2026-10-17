import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

/** Mặt hàng đang theo dõi (lưu trên máy), ghim lên đầu bảng giá */
const KEY = 'followed_products';
const listeners = new Set<() => void>();
const store =
  Platform.OS === 'web'
    ? { get: (k: string) => localStorage.getItem(k), set: (k: string, v: string) => localStorage.setItem(k, v) }
    : { get: (k: string) => Storage.getItemSync(k), set: (k: string, v: string) => Storage.setItemSync(k, v) };

let current: string[] = (() => {
  try {
    return JSON.parse(store.get(KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
})();

export function toggleFollow(code: string) {
  current = current.includes(code) ? current.filter((c) => c !== code) : [...current, code];
  try {
    store.set(KEY, JSON.stringify(current));
  } catch {
    // Không lưu được: vẫn dùng trong phiên này
  }
  listeners.forEach((l) => l());
}

export function useFollowed(): string[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => current,
  );
}
