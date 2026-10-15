import { DealWatcher, type DealWatchState } from '@nhanong/shared';
import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import { api } from './api';
import { getAuth } from './auth';

const SEEN_KEY = 'deal_seen';
const INTERVAL_MS = 8000;

const store =
  Platform.OS === 'web'
    ? { get: (k: string) => localStorage.getItem(k), set: (k: string, v: string) => localStorage.setItem(k, v) }
    : { get: (k: string) => Storage.getItemSync(k), set: (k: string, v: string) => Storage.setItemSync(k, v) };

/**
 * Theo dõi đơn mua bán chung trên app: hỏi server 8 giây 1 lần khi app đang mở (hỏi ngay khi quay lại app),
 * báo khi bên kia vừa ghi / xác nhận / báo sai; số mục chờ xác nhận hiện trên tab "Đơn".
 * App đóng hẳn thì không báo được (cần thông báo đẩy từ server, làm sau).
 */
export const dealWatcher = new DealWatcher(api, {
  getToken: () => getAuth()?.token ?? null,
  loadSeen: () => {
    try {
      return JSON.parse(store.get(SEEN_KEY) ?? '{}');
    } catch {
      return {};
    }
  },
  saveSeen: (seen) => {
    try {
      store.set(SEEN_KEY, JSON.stringify(seen));
    } catch {
      // Không lưu được: lần sau có thể báo lại 1 lần
    }
  },
});

let started = false;
let lastToken: string | null = null;

export function startDealWatch() {
  if (started) return;
  started = true;
  let active = AppState.currentState === 'active';
  const tick = async () => {
    const token = getAuth()?.token ?? null;
    if (token !== lastToken) {
      dealWatcher.reset();
      lastToken = token;
    }
    if (!token || !active) return;
    await dealWatcher.poll().catch(() => {});
  };
  void tick();
  setInterval(tick, INTERVAL_MS);
  AppState.addEventListener('change', (state) => {
    active = state === 'active';
    if (active) void tick();
  });
}

export function useDealWatch(): DealWatchState {
  return useSyncExternalStore(dealWatcher.subscribe, dealWatcher.getState);
}
