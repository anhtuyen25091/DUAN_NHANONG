import { formatVnd, SYNC_STATUS_LABELS, totals, type Ledger, type LedgerSnapshot } from '@nhanong/shared'
import { useState } from 'react'
import { go, href } from '../../hooks'
import { getSync, useSyncStatus } from '../../ledger/sync'
import { showToast } from '../../ledger/toast'

export function LedgerSettings({ ledger, data }: { ledger: Ledger; data: LedgerSnapshot }) {
  const [importing, setImporting] = useState(false)

  const exportFile = () => {
    const blob = new Blob([JSON.stringify(ledger.exportBackup(), null, 1)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `so-thu-chi-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importFile = async (file: File | undefined) => {
    if (!file) return
    setImporting(true)
    try {
      const changed = await ledger.importBackup(await file.text())
      showToast({ message: changed ? `Đã nhập ${changed} mục từ file sao lưu.` : 'File này không có gì mới.' })
    } catch (error) {
      showToast({ message: (error as Error).message })
    } finally {
      setImporting(false)
    }
  }

  const wipe = async () => {
    const t = totals(data.transactions)
    const ok = window.confirm(
      `Xóa hết sổ thu chi trên máy này?\n${data.gardens.length} vườn, ${data.transactions.length} khoản (tiền ra ${formatVnd(t.expense)}).\n` +
        (data.meta.storage_mode === 'sync'
          ? 'Sổ trên mạng vẫn giữ; máy này sẽ đăng xuất. Đăng nhập lại để lấy sổ về.'
          : 'Nên sao lưu ra file trước. Không hoàn tác được.'),
    )
    if (!ok) return
    // Đang lưu cả trên mạng: đăng xuất trên máy này, sổ trên mạng vẫn giữ
    if (data.meta.storage_mode === 'sync') await getSync().disable(false)
    await ledger.reset()
    showToast({ message: 'Đã xóa hết sổ thu chi trên máy này.' })
    go('so')
  }

  return (
    <div className="ledger">
      <a className="back" href={href('so')}>
        ‹ Sổ thu chi
      </a>
      <h1>Cài đặt sổ</h1>

      <StoragePlace data={data} />

      <section className="card">
        <h2>Chế độ Nâng cao</h2>
        <label className="toggle">
          <input type="checkbox" checked={!!data.meta.advanced} onChange={(e) => ledger.setMeta({ advanced: e.target.checked })} />
          <span>
            <b>Bật mùa vụ, kho vật tư, công nợ</b>
            <span className="small muted">Chia lời/lỗ theo vụ; mua phân thuốc về kho rồi ghi dùng cho vườn nào; ghi mua thiếu, bán chịu. Tắt đi thì dữ liệu vẫn giữ.</span>
          </span>
        </label>
      </section>

      <section className="card">
        <h2>Sao lưu</h2>
        <p className="small muted">Tải sổ ra 1 file để cất giữ. Đổi máy hoặc xóa trình duyệt thì nhập lại file này.</p>
        <div className="actions">
          <button type="button" className="primary" onClick={exportFile}>
            ⬇️ Tải file sao lưu
          </button>
          <label className="button file-button">
            {importing ? 'Đang nhập…' : '⬆️ Nhập từ file'}
            <input type="file" accept="application/json,.json" hidden onChange={(e) => importFile(e.target.files?.[0])} />
          </label>
        </div>
      </section>

      <section className="card">
        <h2>Xóa dữ liệu</h2>
        <button type="button" className="danger-outline" onClick={wipe}>
          Xóa hết sổ trên máy này
        </button>
      </section>
    </div>
  )
}

function StoragePlace({ data }: { data: LedgerSnapshot }) {
  const status = useSyncStatus()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const account = data.meta.account

  if (data.meta.storage_mode !== 'sync' || !account)
    return (
      <section className="card">
        <h2>Nơi lưu</h2>
        <p>📱 Chỉ lưu trên máy này</p>
        <p className="small muted">Bật lưu cả trên mạng để đổi máy, mất máy không mất sổ. Cần số điện thoại.</p>
        <a className="button primary" href={href('so/dang-nhap')}>
          ☁️ Bật lưu cả trên mạng
        </a>
      </section>
    )

  const switchToLocal = async (deleteFromServer: boolean) => {
    setBusy(true)
    try {
      await getSync().disable(deleteFromServer)
      setAsking(false)
      showToast({ message: deleteFromServer ? 'Đã xóa sổ trên mạng. Từ nay chỉ lưu trên máy này.' : 'Từ nay chỉ lưu trên máy này.' })
    } catch (error) {
      showToast({ message: (error as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card">
      <h2>Nơi lưu</h2>
      <p>☁️ Lưu cả trên mạng</p>
      <p className="small">
        Tài khoản: <b>{account.name}</b>
        {account.phone && ` · ${account.phone}`}
      </p>
      <p className="small muted">
        {SYNC_STATUS_LABELS[status]}
        {data.meta.last_synced_at && ` · Lần cuối: ${new Date(data.meta.last_synced_at).toLocaleString('vi-VN')}`}
      </p>
      <div className="actions">
        {status === 'expired' ? (
          <a className="button primary" href={href('so/dang-nhap')}>
            Đăng nhập lại
          </a>
        ) : (
          <button type="button" disabled={status === 'syncing'} onClick={() => void getSync().syncNow()}>
            🔄 Đồng bộ ngay
          </button>
        )}
        {!asking && (
          <button type="button" onClick={() => setAsking(true)}>
            📱 Chuyển về chỉ lưu trên máy
          </button>
        )}
      </div>

      {asking && (
        <div className="switch-mode">
          <p>
            <b>Sổ đang lưu trên mạng thì sao?</b>
          </p>
          <p className="small muted">Sổ trên máy này vẫn giữ nguyên dù chọn cách nào.</p>
          <div className="actions">
            <button type="button" disabled={busy} onClick={() => switchToLocal(false)}>
              Giữ lại trên mạng
            </button>
            <button type="button" className="danger-outline" disabled={busy} onClick={() => switchToLocal(true)}>
              Xóa hẳn trên mạng
            </button>
            <button type="button" className="linklike" disabled={busy} onClick={() => setAsking(false)}>
              Hủy
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
