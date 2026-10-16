/**
 * Theo dõi đơn mua bán chung và phiếu được gửi cho mình: hỏi server vài giây 1 lần (chỉ lấy cái mới đổi), để
 * - đếm số mục bên kia ghi đang chờ mình xác nhận (hiện số trên menu / tab "Đơn")
 * - báo "Chú Ba đồng ý Đợt cân …" khi BÊN KIA vừa làm gì (việc của chính mình thì không báo)
 * - báo "Lái Tư gửi phiếu PM-000012 cho bạn", "Lái Tư sửa phiếu …", "… đã xóa phiếu …"
 * - báo trang đơn / phiếu đang mở tải lại ngay khi nó đổi.
 * Lần đầu chạy trên máy (chưa có gì đã xem) chỉ ghi nhận, không báo dồn các việc cũ.
 */
import type { Api, Deal } from './api';

export interface DealNotice {
  id: string;
  /** Thông báo về đơn mua bán: mở đơn này */
  dealUuid?: string;
  /** Thông báo về phiếu được gửi cho mình: mở phiếu này */
  purchaseId?: string;
  title: string;
  text: string;
  at: string;
}

export interface DealWatchState {
  /** Tổng số mục chờ mình xác nhận ở các đơn đang mở */
  awaiting: number;
  notices: DealNotice[];
}

type Seen = Record<string, string>;

export class DealWatcher {
  private state: DealWatchState = { awaiting: 0, notices: [] };
  private listeners = new Set<() => void>();
  private changeListeners = new Set<(dealUuid: string) => void>();
  private awaitingByDeal = new Map<string, number>();
  private updatedAt = new Map<string, string>();
  private since: string | null = null;
  private purchaseSince: string | null = null;
  private running = false;
  private api: Pick<Api, 'deals'> & Partial<Pick<Api, 'receivedPurchases'>>;
  private options: { getToken: () => string | null; loadSeen: () => Seen; saveSeen: (seen: Seen) => void; maxNotices?: number };

  constructor(api: Pick<Api, 'deals'> & Partial<Pick<Api, 'receivedPurchases'>>, options: DealWatcher['options']) {
    this.api = api;
    this.options = options;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): DealWatchState => this.state;

  /** Gọi khi 1 đơn (uuid đơn) hoặc 1 phiếu được gửi (uuid phiếu) vừa đổi: trang đang mở dùng để tải lại */
  onDealChanged(listener: (dealUuid: string) => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  dismiss(id: string) {
    this.set({ ...this.state, notices: this.state.notices.filter((n) => n.id !== id) });
  }

  /** Đăng xuất / đổi tài khoản: quên hết */
  reset() {
    this.awaitingByDeal.clear();
    this.updatedAt.clear();
    this.since = null;
    this.purchaseSince = null;
    this.set({ awaiting: 0, notices: [] });
  }

  /** Hỏi server 1 lần; trả về các đơn vừa đổi */
  async poll(): Promise<Deal[]> {
    const token = this.options.getToken();
    if (!token || this.running) return [];
    this.running = true;
    try {
      const deals = await this.api.deals(token, this.since ?? undefined);
      const seen = { ...this.options.loadSeen() };
      const firstRun = Object.keys(seen).length === 0;
      const notices: DealNotice[] = [];
      const changed: Deal[] = [];

      for (const deal of deals) {
        this.awaitingByDeal.set(deal.uuid, deal.status === 'open' ? deal.summary.awaiting_me : 0);
        if (this.updatedAt.get(deal.uuid) !== deal.updated_at) {
          if (this.updatedAt.has(deal.uuid)) changed.push(deal);
          this.updatedAt.set(deal.uuid, deal.updated_at);
        }
        const activity = deal.last_activity;
        if (!activity?.at) continue;
        const before = seen[deal.uuid];
        if (!before || activity.at > before) {
          if (!activity.by_me && !firstRun) {
            notices.push({ id: `${deal.uuid}|${activity.at}`, dealUuid: deal.uuid, title: deal.title, text: activity.text, at: activity.at });
          }
          seen[deal.uuid] = activity.at;
        }
        if (!this.since || deal.updated_at > this.since) this.since = deal.updated_at;
      }

      await this.pollPurchases(token, seen, firstRun, notices);

      this.options.saveSeen(seen);
      const awaiting = [...this.awaitingByDeal.values()].reduce((s, n) => s + n, 0);
      const max = this.options.maxNotices ?? 5;
      this.set({ awaiting, notices: [...notices, ...this.state.notices].slice(0, max) });
      changed.forEach((deal) => this.changeListeners.forEach((l) => l(deal.uuid)));
      return changed;
    } finally {
      this.running = false;
    }
  }

  /** Phiếu được gửi cho mình: báo khi được gửi vào app, bị sửa, bị xóa (lỗi thì bỏ qua, không làm hỏng phần đơn) */
  private async pollPurchases(token: string, seen: Seen, firstRun: boolean, notices: DealNotice[]) {
    if (!this.api.receivedPurchases) return;
    let purchases;
    try {
      purchases = await this.api.receivedPurchases(token, this.purchaseSince ?? undefined);
    } catch {
      return;
    }
    for (const p of purchases) {
      const key = `p:${p.id}`;
      const activity = p.activity;
      if (activity?.at && (!seen[key] || activity.at > seen[key])) {
        if (!activity.by_me && !firstRun) {
          notices.push({ id: `${key}|${activity.at}`, purchaseId: p.id, title: `Phiếu ${p.code}`, text: activity.text, at: activity.at });
          this.changeListeners.forEach((l) => l(p.id));
        }
        seen[key] = activity.at;
      }
      for (const at of [p.updated_at, activity?.at]) {
        if (at && (!this.purchaseSince || at > this.purchaseSince)) this.purchaseSince = at;
      }
    }
  }

  private set(state: DealWatchState) {
    this.state = state;
    this.listeners.forEach((l) => l());
  }
}
