import { useSyncExternalStore } from 'react';

export interface Toast {
  message: string;
  undo?: () => void;
}

let current: Toast | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function set(toast: Toast | null) {
  current = toast;
  listeners.forEach((l) => l());
}

/** Thông báo ngắn ở cuối màn hình, có nút "Hoàn tác" trong 6 giây */
export function showToast(toast: Toast) {
  clearTimeout(timer);
  timer = setTimeout(() => set(null), 6000);
  set(toast);
}

export function hideToast() {
  clearTimeout(timer);
  set(null);
}

export function useToast(): Toast | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
