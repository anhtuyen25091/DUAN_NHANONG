import { SyncEngine, type Ledger, type SyncStatus } from '@nhanong/shared';
import Constants from 'expo-constants';
import { useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import { api } from './api';

let engine: SyncEngine | null = null;

/**
 * Bộ đồng bộ dùng chung cho cả app (tạo 1 lần khi mở sổ).
 * Tự gửi sau mỗi lần ghi; đồng bộ lại mỗi khi app quay lại màn hình.
 */
export function startSync(ledger: Ledger): SyncEngine {
  if (engine) return engine;
  const sync = new SyncEngine(ledger, api);
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
