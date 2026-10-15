import { SYNC_STATUS_LABELS } from '@nhanong/shared'
import { href } from '../../hooks'
import { getSync, useSyncStatus } from '../../ledger/sync'

/** Dòng trạng thái ✅ / 🔄 / ⚠️ trên trang sổ; ẩn khi chỉ lưu trên máy */
export function SyncBadge() {
  const status = useSyncStatus()
  if (status === 'off') return null

  return (
    <p className={`sync-badge ${status}`} role="status">
      <span>{SYNC_STATUS_LABELS[status]}</span>
      {status === 'offline' && (
        <button type="button" className="linklike" onClick={() => void getSync().syncNow()}>
          Thử lại
        </button>
      )}
      {status === 'expired' && (
        <a className="linklike" href={href('so/dang-nhap')}>
          Đăng nhập
        </a>
      )}
    </p>
  )
}
