import { formatVnd, type Deal, type DealEntry, type DealTotals } from '@nhanong/shared';
import { api } from './api';
import { getAuth } from './auth';
import { openLedger } from './ledger';

export const KIND_LABEL: Record<DealEntry['kind'], string> = { deposit: '💰 Cọc', cut: '✂️ Đợt cân', payment: '💵 Trả tiền', cost: '🧾 Chi phí riêng' };
export const STATUS_LABEL: Record<DealEntry['status'], string> = { pending: '⏳ Chờ xác nhận', confirmed: '✅ Đã xác nhận', disputed: '⚠️ Báo sai', private: '🔒 Chỉ mình thấy' };

/** Bên kia (tên đã tham gia, hoặc tên người tạo gõ sẵn) */
export function counterpartName(deal: Deal): string {
  return deal.counterpart?.name ?? (deal.my_role === 'buyer' ? deal.seller_name : deal.buyer_name) ?? 'Chưa có người tham gia';
}

/** "Mình còn phải trả 24.250.000 đ" / "Bên mua còn nợ mình …" */
/** totals: số liệu đã xác nhận, hoặc gồm cả các mục đang chờ */
export function balanceText(deal: Deal, totals: DealTotals): string {
  const balance = totals.balance;
  if (balance === 0) return totals.delivered === 0 ? 'Chưa có đợt cân nào được xác nhận' : 'Đã thanh toán đủ';
  const buyerOwes = balance > 0;
  const iAmBuyer = deal.my_role === 'buyer';
  const amount = formatVnd(Math.abs(balance));
  if (buyerOwes) return iAmBuyer ? `Mình còn phải trả ${amount}` : `Bên mua còn nợ mình ${amount}`;
  return iAmBuyer ? `Bên bán còn nợ lại mình ${amount}` : `Mình nhận dư ${amount}, cần trả lại`;
}

let refreshing: Promise<void> | null = null;

/**
 * Ghi lại vào sổ các đơn mua bán chung đã nối (đợt cân đã xác nhận, chi phí riêng).
 * Chạy khi mở tab Sổ thu chi và khi xem 1 đơn; lỗi mạng thì bỏ qua, lần sau chạy lại.
 */
export function refreshLinkedDeals(): Promise<void> {
  refreshing ??= (async () => {
    const auth = getAuth();
    if (!auth) return;
    const ledger = await openLedger();
    const links = Object.keys(ledger.getSnapshot().meta.deal_links ?? {});
    for (const uuid of links) {
      try {
        await ledger.applyDeal(await api.deal(auth.token, uuid));
      } catch {
        // Mất mạng / đơn đã xóa: để lần sau
      }
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}
