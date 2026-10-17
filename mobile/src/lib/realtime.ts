import { RealtimeLink, type RealtimeClientLike } from '@nhanong/shared';
import * as Ably from 'ably';
import { api } from './api';
import { getAuth, subscribeAuth } from './auth';

let link: RealtimeLink | null = null;

/** Cập nhật tức thì qua Ably (nếu máy chủ bật): có việc mới thì gọi onUpdate ngay thay vì đợi lần hỏi định kỳ */
export function startRealtime(onUpdate: () => void, onState: (connected: boolean) => void) {
  if (link) return;
  link = new RealtimeLink({
    api,
    getToken: () => getAuth()?.token ?? null,
    createClient: (authCallback) => new Ably.Realtime({ authCallback: authCallback as never, autoConnect: true }) as unknown as RealtimeClientLike,
    onUpdate,
    onState,
  });
  void link.refresh();
  subscribeAuth(() => void link?.refresh());
}

export const realtimeConnected = () => link?.connected() ?? false;
