/**
 * Cập nhật tức thì qua Ably, dùng chung web + app (thư viện ably-js do từng nền tảng truyền vào qua createClient).
 * Mỗi tài khoản nghe kênh riêng "user:{id}"; có tin thì gọi onUpdate (app tải lại ngay).
 * Không bật (máy chủ chưa cấu hình), lỗi, hết lượt kết nối hay mất mạng: connected() = false, app hỏi máy chủ định kỳ như cũ.
 */
import type { Api } from './api';

/** Phần ably-js cần dùng (Ably.Realtime) */
export interface RealtimeClientLike {
  connection: { state: string; on: (listener: (change: { current: string }) => void) => void };
  channels: { get: (name: string) => { subscribe: (listener: (message: { data?: unknown }) => void) => unknown } };
  close: () => void;
}

export type AuthCallback = (params: unknown, callback: (error: { message: string } | null, tokenRequest: Record<string, unknown> | null) => void) => void;

export interface RealtimeOptions {
  api: Pick<Api, 'realtimeToken'>;
  getToken: () => string | null;
  /** new Ably.Realtime({ authCallback, autoConnect: true }) */
  createClient: (authCallback: AuthCallback) => RealtimeClientLike;
  onUpdate: (data: unknown) => void;
  /** Đổi trạng thái kết nối (để giãn / thu hẹp nhịp hỏi máy chủ) */
  onState?: (connected: boolean) => void;
}

export class RealtimeLink {
  private client: RealtimeClientLike | null = null;
  private token: string | null = null;
  private isConnected = false;
  private options: RealtimeOptions;

  constructor(options: RealtimeOptions) {
    this.options = options;
  }

  connected(): boolean {
    return this.isConnected;
  }

  /** Gọi khi mở app và mỗi khi đăng nhập / đăng xuất: kết nối lại với tài khoản mới (hoặc ngắt) */
  async refresh(): Promise<void> {
    const token = this.options.getToken();
    if (token === this.token && (this.client || token === null)) return;
    this.stop();
    this.token = token;
    if (!token) return;

    let info: Awaited<ReturnType<Api['realtimeToken']>>;
    try {
      info = await this.options.api.realtimeToken(token);
    } catch {
      return; // Mất mạng: lần mở app / đăng nhập sau thử lại
    }
    if (!info.enabled || !info.channel || token !== this.token) return;

    const first = info.token_request ?? null;
    let used = false;
    const client = this.options.createClient((_params, callback) => {
      // Lần đầu dùng vé vừa lấy; vé hết hạn thì xin vé mới
      if (!used && first) {
        used = true;
        callback(null, first);
        return;
      }
      this.options.api
        .realtimeToken(token)
        .then((r) => callback(null, r.token_request ?? null))
        .catch((e: Error) => callback({ message: e.message }, null));
    });
    this.client = client;
    client.connection.on((change) => this.setConnected(change.current === 'connected'));
    client.channels.get(info.channel).subscribe((message) => this.options.onUpdate(message.data));
  }

  stop(): void {
    this.client?.close();
    this.client = null;
    this.setConnected(false);
  }

  private setConnected(connected: boolean) {
    if (connected === this.isConnected) return;
    this.isConnected = connected;
    this.options.onState?.(connected);
  }
}
