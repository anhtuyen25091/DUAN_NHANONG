/**
 * Phiếu lập lúc mất sóng (lái cân hàng ở vườn): lưu trên máy kèm uuid tạo sẵn, có mạng lại thì tự gửi lên.
 * Gửi lại cùng uuid thì máy chủ trả phiếu đã lưu (không tạo trùng), nên rớt mạng giữa chừng cũng an toàn.
 * Máy chủ từ chối (vd vượt giá chủ chốt, tài khoản bị khóa) thì giữ lại kèm lý do để người dùng sửa hoặc bỏ.
 */
import { ApiError, randomUuid, type Api } from './api';
import type { Purchase, PurchaseInput } from './trade';

export interface PendingPurchase {
  /** uuid phiếu (cũng là uuid trên máy chủ sau khi gửi) */
  id: string;
  /** Tài khoản lập phiếu: chỉ gửi khi đang đăng nhập đúng tài khoản đó */
  user_id: number;
  input: PurchaseInput;
  created_at: string;
  /** Lý do máy chủ từ chối; null = đang chờ mạng */
  error: string | null;
}

export interface OutboxState {
  items: PendingPurchase[];
  sending: boolean;
}

export interface OutboxOptions {
  getAuth: () => { token: string; user: { id: number } } | null;
  load: () => string | null;
  save: (value: string) => void;
}

/** Lỗi mất mạng / máy chủ không trả lời (thử lại sau), khác với lỗi máy chủ từ chối phiếu */
export function isOfflineError(err: unknown): boolean {
  return err instanceof ApiError ? err.status === 0 || err.status >= 500 : err instanceof TypeError;
}

export class PurchaseOutbox {
  private state: OutboxState;
  private listeners = new Set<() => void>();
  private api: Pick<Api, 'savePurchase'>;
  private options: OutboxOptions;

  constructor(api: Pick<Api, 'savePurchase'>, options: OutboxOptions) {
    this.api = api;
    this.options = options;
    this.state = { items: this.read(), sending: false };
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = () => this.state;

  /** Phiếu chờ gửi của tài khoản đang đăng nhập */
  mine(): PendingPurchase[] {
    const userId = this.options.getAuth()?.user.id;
    return this.state.items.filter((p) => p.user_id === userId);
  }

  get(id: string): PendingPurchase | undefined {
    return this.state.items.find((p) => p.id === id);
  }

  /** Lưu phiếu lên máy (khi gửi không được vì mất mạng) */
  add(input: PurchaseInput, id: string = randomUuid()): PendingPurchase {
    const auth = this.options.getAuth();
    if (!auth) throw new Error('Cần đăng nhập để lập phiếu.');
    const item: PendingPurchase = { id, user_id: auth.user.id, input: { ...input, kind: input.kind ?? 'buy' }, created_at: new Date().toISOString(), error: null };
    this.set({ items: [...this.state.items.filter((p) => p.id !== id), item] });
    return item;
  }

  remove(id: string) {
    this.set({ items: this.state.items.filter((p) => p.id !== id) });
  }

  /**
   * Gửi các phiếu đang chờ của tài khoản đang đăng nhập, theo thứ tự lập. Mất mạng thì dừng (lần sau gửi tiếp);
   * máy chủ từ chối thì ghi lý do và gửi tiếp phiếu sau. retryFailed: gửi lại cả phiếu đã bị từ chối.
   */
  async flush(retryFailed = false): Promise<Purchase[]> {
    const auth = this.options.getAuth();
    if (!auth || this.state.sending) return [];
    const queue = this.mine().filter((p) => retryFailed || p.error === null);
    if (queue.length === 0) return [];
    this.set({ sending: true });
    const sent: Purchase[] = [];
    try {
      for (const item of queue) {
        try {
          sent.push(await this.api.savePurchase(auth.token, { ...item.input, uuid: item.id }));
          this.remove(item.id);
        } catch (err) {
          if (isOfflineError(err)) break;
          const message = err instanceof ApiError ? (Object.values(err.errors)[0]?.[0] ?? err.message) : (err as Error).message;
          this.set({ items: this.state.items.map((p) => (p.id === item.id ? { ...p, error: message } : p)) });
        }
      }
    } finally {
      this.set({ sending: false });
    }
    return sent;
  }

  private set(patch: Partial<OutboxState>) {
    this.state = { ...this.state, ...patch };
    if (patch.items) {
      try {
        this.options.save(JSON.stringify(patch.items));
      } catch {
        // Không lưu được (bộ nhớ đầy): vẫn giữ trong phiên này
      }
    }
    this.listeners.forEach((l) => l());
  }

  private read(): PendingPurchase[] {
    try {
      const items = JSON.parse(this.options.load() ?? '[]');
      return Array.isArray(items) ? items : [];
    } catch {
      return [];
    }
  }
}
