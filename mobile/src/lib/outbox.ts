import { PurchaseOutbox, type OutboxState } from '@nhanong/shared';
import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import { api } from './api';
import { getAuth } from './auth';
import { showToast } from './toast';

const KEY = 'purchase_outbox';
const INTERVAL_MS = 30_000;

const store =
  Platform.OS === 'web'
    ? { get: (k: string) => localStorage.getItem(k), set: (k: string, v: string) => localStorage.setItem(k, v) }
    : { get: (k: string) => Storage.getItemSync(k), set: (k: string, v: string) => Storage.setItemSync(k, v) };

/**
 * Phiếu lập lúc mất sóng (cân hàng ở vườn): lưu trên máy, tự gửi khi có mạng lại
 * (mở app, quay lại app, 30 giây / lần khi app đang mở).
 */
export const purchaseOutbox = new PurchaseOutbox(api, {
  getAuth,
  load: () => store.get(KEY),
  save: (value) => store.set(KEY, value),
});

/** Gửi các phiếu chờ; gửi được thì báo */
export async function flushOutbox(retryFailed = false) {
  const sent = await purchaseOutbox.flush(retryFailed);
  if (sent.length > 0) showToast({ message: `Đã gửi ${sent.length} phiếu lập lúc mất sóng (${sent.map((p) => p.code).join(', ')})` });
  return sent;
}

let started = false;

export function startPurchaseOutbox() {
  if (started) return;
  started = true;
  let active = AppState.currentState === 'active';
  const tick = () => {
    if (active) void flushOutbox().catch(() => {});
  };
  tick();
  setInterval(tick, INTERVAL_MS);
  AppState.addEventListener('change', (state) => {
    active = state === 'active';
    tick();
  });
}

export function useOutbox(): OutboxState {
  return useSyncExternalStore(purchaseOutbox.subscribe, purchaseOutbox.getState);
}
