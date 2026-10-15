import { formatVnd, type Deal } from '@nhanong/shared'

/** Bên kia (tên đã tham gia, hoặc tên người tạo gõ sẵn) */
export function counterpartName(deal: Deal): string {
  return deal.counterpart?.name ?? (deal.my_role === 'buyer' ? deal.seller_name : deal.buyer_name) ?? 'Chưa có người tham gia'
}

/** "Mình còn phải trả 24.250.000 đ" / "Bên mua còn nợ mình …" */
export function balanceText(deal: Deal, balance: number): string {
  if (balance === 0) return deal.summary.confirmed.delivered === 0 && deal.summary.with_pending.delivered === 0 ? 'Chưa có đợt cân nào' : 'Đã thanh toán đủ'
  const buyerOwes = balance > 0
  const iAmBuyer = deal.my_role === 'buyer'
  const amount = formatVnd(Math.abs(balance))
  if (buyerOwes) return iAmBuyer ? `Mình còn phải trả ${amount}` : `Bên mua còn nợ mình ${amount}`
  return iAmBuyer ? `Bên bán còn nợ lại mình ${amount}` : `Mình nhận dư ${amount}, cần trả lại`
}
