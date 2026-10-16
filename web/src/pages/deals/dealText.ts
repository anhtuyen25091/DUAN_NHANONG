import { formatVnd, type Deal, type DealTotals } from '@nhanong/shared'

/** Bên kia (tên đã tham gia, hoặc tên người tạo gõ sẵn) */
export function counterpartName(deal: Deal): string {
  return deal.counterpart?.name ?? (deal.my_role === 'buyer' ? deal.seller_name : deal.buyer_name) ?? 'Chưa có người tham gia'
}

/** "Mình còn phải trả 24.250.000 đ" / "Bên mua còn nợ mình …" */
/** totals: số liệu đã xác nhận, hoặc gồm cả các mục đang chờ */
export function balanceText(deal: Deal, totals: DealTotals): string {
  const balance = totals.balance
  if (balance === 0) return totals.delivered === 0 ? 'Chưa có đợt cân nào được xác nhận' : 'Đã thanh toán đủ'
  const buyerOwes = balance > 0
  const iAmBuyer = deal.my_role === 'buyer'
  const amount = formatVnd(Math.abs(balance))
  // Chủ doanh nghiệp xem đơn của lái: nói theo tên lái thay cho "mình"
  const Me = deal.read_only ? (deal.viewing_as ?? 'Lái') : 'Mình'
  const me = deal.read_only ? Me : 'mình'
  if (buyerOwes) return iAmBuyer ? `${Me} còn phải trả ${amount}` : `Bên mua còn nợ ${me} ${amount}`
  return iAmBuyer ? `Bên bán còn nợ lại ${me} ${amount}` : `${Me} nhận dư ${amount}, cần trả lại`
}
