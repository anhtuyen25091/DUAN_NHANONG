import { runFarmWorkSync, type FarmWorkSyncStore } from '@nhanong/shared';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { getIotAuth, iotApi, iotStore } from './iot';
import { openLedger } from './ledger';

/**
 * Việc làm vườn: đồng bộ 2 chiều nhật ký canh tác (Sổ thu chi trên máy này) ↔ việc trên lô cảm biến.
 * Chạy 1 lượt mỗi lần (gọi chồng thì dùng chung lượt đang chạy), cách nhau ít nhất 30 giây trừ khi force.
 * Lỗi (mất mạng…) bỏ qua: lần sau đồng bộ tiếp từ mốc cũ.
 */
const MIN_GAP_MS = 30_000;
let running: Promise<number> | null = null;
let lastRun = 0;
const listeners = new Set<() => void>();

function storeFor(userId: number): FarmWorkSyncStore {
  const key = `iot_farmwork_sync:${userId}`;
  return {
    get: () => {
      try {
        return JSON.parse(iotStore.get(key) ?? '{}') as Record<number, string>;
      } catch {
        return {};
      }
    },
    set: (value) => iotStore.set(key, JSON.stringify(value)),
  };
}

/** @return số thay đổi (0 khi không chạy / lỗi) */
export function syncFarmWork(force = false): Promise<number> {
  if (running) return running;
  const auth = getIotAuth();
  if (!auth) return Promise.resolve(0);
  if (!force && Date.now() - lastRun < MIN_GAP_MS) return Promise.resolve(0);
  lastRun = Date.now();
  running = openLedger()
    .then((ledger) => runFarmWorkSync(iotApi, ledger, storeFor(auth.user.id)))
    .catch(() => 0)
    .then((changes) => {
      if (changes > 0) listeners.forEach((l) => l());
      return changes;
    })
    .finally(() => {
      running = null;
    });
  return running;
}

/** Gọi khi đồng bộ vừa đổi gì đó (để tải lại danh sách đang xem) */
export function onFarmWorkChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Mở màn hình: đồng bộ (có giãn cách); đổi gì thì gọi onChanged */
export function useFarmWorkSyncOnFocus(onChanged?: () => void) {
  useFocusEffect(
    useCallback(() => {
      void syncFarmWork();
      if (!onChanged) return;
      return onFarmWorkChanged(onChanged);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );
}
