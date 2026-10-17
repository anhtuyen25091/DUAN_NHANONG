import { SyncEngine, type Ledger, type SyncStatus } from '@nhanong/shared';
import Constants from 'expo-constants';
import { useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import { api } from './api';
import { syncPhotos } from './receipts';

let engine: SyncEngine | null = null;

/**
 * Bộ đồng bộ dùng chung cho cả app (tạo 1 lần khi mở sổ).
 * Tự gửi sau mỗi lần ghi; mất mạng thì SyncEngine tự thử lại (giãn dần tới mỗi phút); đồng bộ lại khi app quay lại màn hình.
 */
export function startSync(ledger: Ledger): SyncEngine {
  if (engine) return engine;
  // Sau mỗi lần đồng bộ sổ: gửi / tải ảnh hóa đơn
  const sync = new SyncEngine(ledger, api, { afterSync: (token) => syncPhotos(ledger, token) });
  engine = sync;
  sync.start();
  AppState.addEventListener('change', (state) => {
    if (state === 'active' && sync.enabled) void sync.syncNow();
  });
  return sync;
}

export function getSync(): SyncEngine {
  if (!engine) throw new Error('Sổ chưa mở');
  return engine;
}

const noop = () => () => {};

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(engine?.subscribe ?? noop, () => engine?.getStatus() ?? 'off');
}

/** Tên máy hiện trong danh sách phiên đăng nhập trên server */
export function deviceName(): string {
  return `App ${Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : 'web'}${Constants.deviceName ? ` (${Constants.deviceName})` : ''}`.slice(0, 100);
}
