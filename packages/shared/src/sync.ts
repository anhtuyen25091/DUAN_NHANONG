/**
 * Đồng bộ sổ thu chi khi người dùng chọn "lưu cả trên mạng".
 * Mỗi lần: gửi các mục đã đổi trên máy → lấy các mục mới từ server → gộp (bản mới hơn thắng).
 * Dùng chung cho web và mobile; mỗi nơi chỉ cần gọi syncNow() khi mở app / có mạng lại.
 */
import { ApiError, type AccountUser, type Api, type SyncPushRecord } from './api';
import { LEDGER_TABLES, type Ledger, type LedgerRecords, type LedgerSnapshot } from './ledger';

/**
 * Trạng thái hiển thị bằng 1 biểu tượng:
 * - off: chỉ lưu trên máy
 * - saved ✅ đã lưu lên mạng · syncing 🔄 đang gửi · offline ⚠️ chưa gửi được do không có mạng
 * - expired: phiên đăng nhập hết hạn, cần đăng nhập lại
 */
export type SyncStatus = 'off' | 'saved' | 'syncing' | 'offline' | 'expired';

export const SYNC_STATUS_LABELS: Record<SyncStatus, string> = {
  off: '📱 Chỉ lưu trên máy này',
  saved: '✅ Đã lưu lên mạng',
  syncing: '🔄 Đang gửi…',
  offline: '⚠️ Chưa gửi được (không có mạng). Sẽ tự gửi khi có mạng.',
  expired: '⚠️ Cần đăng nhập lại để tiếp tục lưu lên mạng',
};

type SyncApi = Pick<Api, 'syncPush' | 'syncPull' | 'deleteServerLedger' | 'logout'>;

const PUSH_CHUNK = 500;

/** Mất mạng thì tự thử lại sau 5 giây, 15 giây, 30 giây, rồi mỗi phút (cho tới khi gửi được) */
const RETRY_MS = [5_000, 15_000, 30_000, 60_000];

/**
 * Máy đang có sổ của tài khoản khác (hoặc sổ chưa gửi lên đâu nhưng đã có dữ liệu thì không hỏi):
 * trả số điện thoại / tên tài khoản cũ để hỏi người dùng gộp vào tài khoản mới hay bỏ sổ trên máy.
 */
export function previousAccount(snapshot: LedgerSnapshot, user: AccountUser): string | null {
  const meta = snapshot.meta;
  const previous = meta.account?.phone ?? meta.linked_phone ?? null;
  if (!previous || previous === (user.phone ?? user.name)) return null;
  const hasData = snapshot.transactions.length > 0 || snapshot.gardens.length > 0;
  return hasData ? previous : null;
}

export class SyncEngine {
  private status: SyncStatus = 'off';
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | null = null;
  private again = false;
  private unsubscribe: (() => void) | null = null;
  private ledger: Ledger;
  private api: SyncApi;
  private debounceMs: number;
  private retryMs: number[];
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private failures = 0;

  constructor(ledger: Ledger, api: SyncApi, options: { debounceMs?: number; retryMs?: number[] } = {}) {
    this.ledger = ledger;
    this.api = api;
    this.debounceMs = options.debounceMs ?? 1500;
    this.retryMs = options.retryMs ?? RETRY_MS;
    this.status = this.enabled ? 'saved' : 'off';
  }

  // ---- Trạng thái cho giao diện (useSyncExternalStore) ----

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getStatus = (): SyncStatus => this.status;

  private setStatus(status: SyncStatus) {
    if (status === this.status) return;
    this.status = status;
    this.listeners.forEach((l) => l());
  }

  get enabled(): boolean {
    const meta = this.ledger.getSnapshot().meta;
    return meta.storage_mode === 'sync' && !!meta.account;
  }

  /** Còn thay đổi trên máy chưa gửi lên */
  hasPending(): boolean {
    return this.ledger.changedSince(this.ledger.getSnapshot().meta.last_pushed_at).length > 0;
  }

  /** Theo dõi sổ: có thay đổi thì tự gửi sau một chút (gom nhiều lần bấm thành 1 lần gửi) */
  start(): () => void {
    this.unsubscribe ??= this.ledger.subscribe(() => {
      if (!this.enabled || !this.hasPending()) return;
      // Đang đồng bộ thì chạy thêm 1 lần sau đó, để không bỏ sót khoản vừa ghi
      if (this.running) this.again = true;
      else this.schedule();
    });
    if (this.enabled) void this.syncNow();
    return () => this.stop();
  }

  stop() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    clearTimeout(this.timer);
    clearTimeout(this.retryTimer);
  }

  private schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.syncNow(), this.debounceMs);
  }

  /** Đồng bộ ngay; đang chạy thì chạy thêm 1 lần sau khi xong */
  async syncNow(): Promise<void> {
    if (!this.enabled) {
      this.setStatus('off');
      return;
    }
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.run().finally(() => {
      this.running = null;
      if (this.again) {
        this.again = false;
        void this.syncNow();
      }
    });
    return this.running;
  }

  private async run() {
    const token = this.ledger.getSnapshot().meta.account!.token;
    this.setStatus('syncing');
    try {
      await this.push(token);
      await this.pull(token);
      await this.ledger.setMeta({ last_synced_at: this.ledger.clock() });
      // Không tự chạy lại dựa vào hasPending(): mục nhận từ máy có đồng hồ chạy nhanh trông như "chưa gửi"
      // và sẽ lặp mãi. Thay đổi mới trên máy đã có subscribe/again lo.
      this.failures = 0;
      clearTimeout(this.retryTimer);
      this.setStatus('saved');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) this.setStatus('expired');
      else {
        this.setStatus('offline');
        this.retryLater();
      }
    }
  }

  /** Không gửi được (mất mạng / server lỗi): tự thử lại, giãn dần; có mạng lại là sổ tự lên, không cần bấm gì */
  private retryLater() {
    clearTimeout(this.retryTimer);
    const delay = this.retryMs[Math.min(this.failures, this.retryMs.length - 1)];
    this.failures++;
    this.retryTimer = setTimeout(() => void this.syncNow(), delay);
  }

  private async push(token: string) {
    // Mốc đặt lúc bắt đầu: thay đổi xảy ra trong lúc đang gửi sẽ được gửi ở lần sau
    const startedAt = this.ledger.clock();
    const changed = this.ledger.changedSince(this.ledger.getSnapshot().meta.last_pushed_at);
    for (let i = 0; i < changed.length; i += PUSH_CHUNK) {
      await this.api.syncPush(token, changed.slice(i, i + PUSH_CHUNK) as SyncPushRecord[]);
    }
    await this.ledger.setMeta({ last_pushed_at: startedAt });
  }

  private async pull(token: string) {
    let since = this.ledger.getSnapshot().meta.sync_version ?? 0;
    for (;;) {
      const page = await this.api.syncPull(token, since);
      const records: Partial<LedgerRecords> = {};
      for (const table of LEDGER_TABLES) if (page.records[table]?.length) records[table] = page.records[table] as never;
      await this.ledger.merge(records);
      since = page.version;
      await this.ledger.setMeta({ sync_version: since });
      if (!page.has_more) break;
    }
  }

  /**
   * Bật "lưu cả trên mạng" sau khi đăng nhập/đăng ký: gửi toàn bộ sổ trên máy rồi lấy dữ liệu đã có trên mạng về.
   * Máy đã có sổ + tài khoản đã có sổ (đổi máy): 2 bên được gộp, không mất bên nào.
   */
  async enable(token: string, user: AccountUser, options: { discardLocal?: boolean } = {}): Promise<void> {
    // Bỏ sổ đang có trên máy (của tài khoản khác), chỉ lấy sổ của tài khoản mới về
    if (options.discardLocal) {
      const advanced = this.ledger.getSnapshot().meta.advanced;
      await this.ledger.reset();
      if (advanced) await this.ledger.setMeta({ advanced });
    }
    this.failures = 0;
    await this.ledger.setMeta({
      storage_mode: 'sync',
      account: { token, name: user.name, phone: user.phone },
      linked_phone: user.phone ?? user.name,
      last_pushed_at: undefined,
      sync_version: 0,
    });
    await this.syncNow();
  }

  /**
   * Về "chỉ lưu trên máy". deleteFromServer = true: xóa hẳn sổ trên mạng (dữ liệu trên máy vẫn giữ).
   * Không có mạng thì báo lỗi, không đổi gì (để người dùng không tưởng đã xóa).
   */
  async disable(deleteFromServer: boolean, options: { keepToken?: boolean } = {}): Promise<void> {
    const token = this.ledger.getSnapshot().meta.account?.token;
    if (token && deleteFromServer) await this.api.deleteServerLedger(token);
    // keepToken: token còn dùng cho việc khác (đăng nhập để xem lịch sử giá) thì không hủy trên server
    if (token && !options.keepToken) await this.api.logout(token).catch(() => {});
    await this.ledger.setMeta({ storage_mode: 'local', account: undefined, sync_version: undefined, last_pushed_at: undefined, last_synced_at: undefined });
    clearTimeout(this.timer);
    clearTimeout(this.retryTimer);
    this.setStatus('off');
  }
}

/** Báo trước khi bật "Lưu cả trên mạng": quản trị viên có thể xem sổ để hỗ trợ, mỗi lần xem đều được ghi lại */
export const CLOUD_PRIVACY_NOTE = 'Sổ lưu trên máy chủ Nhà Nông. Quản trị viên có thể xem để hỗ trợ khi bạn cần; mỗi lần xem đều được ghi lại.';
