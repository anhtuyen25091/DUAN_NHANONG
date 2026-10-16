import type { DealNotice } from '@nhanong/shared'
import { useEffect } from 'react'
import { dealWatcher, useDealWatch } from '../dealWatch'
import { href } from '../hooks'
import { hideToast, useToast } from '../ledger/toast'

/** Thông báo đơn mua bán (bên kia vừa ghi / xác nhận) + thanh "Đã lưu…" dùng chung mọi trang */
export function Notices() {
  const { notices } = useDealWatch()
  const toast = useToast()

  // Thông báo tự ẩn sau 12 giây
  useEffect(() => {
    if (notices.length === 0) return
    const timer = setTimeout(() => dealWatcher.dismiss(notices[notices.length - 1].id), 12_000)
    return () => clearTimeout(timer)
  }, [notices])

  return (
    <>
      {notices.length > 0 && (
        <div className="notices" role="status" aria-live="polite">
          {notices.map((n) => (
            <div key={n.id} className="notice-pop">
              <span className="notice-pop-icon" aria-hidden>
                🔔
              </span>
              <span className="notice-pop-text">
                <b>{n.title}</b>
                <span>{n.text}</span>
              </span>
              <a className="button small-btn primary" href={noticeHref(n)} onClick={() => dealWatcher.dismiss(n.id)}>
                Xem
              </a>
              <button type="button" className="notice-close" aria-label="Đóng" onClick={() => dealWatcher.dismiss(n.id)}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              type="button"
              onClick={() => {
                toast.undo!()
                hideToast()
              }}
            >
              Hoàn tác
            </button>
          )}
        </div>
      )}
    </>
  )
}

/** Bấm "Xem": đơn của mình, phiếu được gửi cho mình, hoặc (chủ doanh nghiệp) phiếu / đơn chung của lái */
function noticeHref(n: DealNotice): string {
  if (n.businessDealUuid) return href(`don/${n.businessDealUuid}`)
  if (n.businessPurchaseId) return href(`giao-dich/phieu/${n.businessPurchaseId}`)
  if (n.purchaseId) return href(`giao-dich/nhan/${n.purchaseId}`)
  return href(`don/${n.dealUuid}`)
}
