import { RealtimeLink, type RealtimeClientLike } from '@nhanong/shared'
import { api } from './api'
import { getAuth, subscribeAuth } from './auth'

let link: RealtimeLink | null = null

/**
 * Cập nhật tức thì qua Ably (nếu máy chủ bật): có việc mới thì gọi onUpdate ngay thay vì đợi lần hỏi định kỳ.
 * Thư viện ably chỉ tải khi đã đăng nhập (không làm nặng trang lúc đầu).
 */
export function startRealtime(onUpdate: () => void, onState: (connected: boolean) => void) {
  if (link) return
  void import('ably').then((Ably) => {
    link = new RealtimeLink({
      api,
      getToken: () => getAuth()?.token ?? null,
      createClient: (authCallback) => new Ably.Realtime({ authCallback: authCallback as never, autoConnect: true }) as unknown as RealtimeClientLike,
      onUpdate,
      onState,
    })
    void link.refresh()
    subscribeAuth(() => void link?.refresh())
  })
}

export const realtimeConnected = () => link?.connected() ?? false
