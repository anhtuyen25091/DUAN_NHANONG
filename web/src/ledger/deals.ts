import { api } from '../api'
import { getAuth } from '../auth'
import { openLedger } from './useLedger'

/**
 * Ghi lại vào sổ các đơn mua bán chung đã nối (đợt cân đã xác nhận, chi phí riêng).
 * Chạy khi mở sổ và khi xem 1 đơn; lỗi mạng thì bỏ qua, lần sau chạy lại.
 */
export async function refreshLinkedDeals(): Promise<void> {
  const auth = getAuth()
  if (!auth) return
  const ledger = await openLedger()
  const links = Object.keys(ledger.getSnapshot().meta.deal_links ?? {})
  for (const uuid of links) {
    try {
      await ledger.applyDeal(await api.deal(auth.token, uuid))
    } catch {
      // Mất mạng / đơn đã xóa: để lần sau
    }
  }
}
