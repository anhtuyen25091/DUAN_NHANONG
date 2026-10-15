import { PROVINCE_CENTERS, type MyLocation } from '@nhanong/shared';
import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { api } from './api';
import { getAuth } from './auth';

/**
 * Khu vực của tôi (tỉnh + vị trí + bán kính) để gợi ý giá và dịch vụ quanh đó.
 * Lưu trên máy; đã đăng nhập thì lưu cả vào tài khoản (máy khác dùng lại được).
 */
const KEY = 'my-location';
const store =
  Platform.OS === 'web'
    ? { get: (k: string) => localStorage.getItem(k), set: (k: string, v: string) => localStorage.setItem(k, v) }
    : { get: (k: string) => Storage.getItemSync(k), set: (k: string, v: string) => Storage.setItemSync(k, v) };

let current: MyLocation | null = read();
const listeners = new Set<() => void>();

function read(): MyLocation | null {
  try {
    const raw = store.get(KEY);
    return raw ? (JSON.parse(raw) as MyLocation) : null;
  } catch {
    return null;
  }
}

function save(location: MyLocation) {
  current = location;
  try {
    store.set(KEY, JSON.stringify(location));
  } catch {
    // Không lưu được: vẫn dùng tới khi tắt app
  }
  listeners.forEach((l) => l());
}

export async function setMyLocation(location: MyLocation): Promise<void> {
  save(location);
  const auth = getAuth();
  if (auth) {
    await api
      .saveMyLocation(auth.token, { province: location.province, lat: location.lat, lng: location.lng, label: location.label, radius: location.radius })
      .catch(() => {}); // Không có mạng: vẫn dùng khu vực trên máy
  }
}

/** Máy chưa chọn khu vực mà tài khoản đã có (chọn ở máy khác) thì dùng luôn */
export function adoptAccountLocation(location: MyLocation | null | undefined) {
  if (current || !location) return;
  // Server không lưu cờ GPS: tọa độ khác trung tâm tỉnh thì là vị trí thật
  const center = PROVINCE_CENTERS[location.province];
  save({ ...location, gps: !center || Math.abs(center[0] - location.lat) > 1e-3 || Math.abs(center[1] - location.lng) > 1e-3 });
}

export function useMyLocation(): MyLocation | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
