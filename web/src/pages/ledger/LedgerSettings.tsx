import { formatVnd, totals, type Ledger, type LedgerSnapshot } from '@nhanong/shared'
import { useState } from 'react'
import { go, href } from '../../hooks'
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
      `Xóa hết sổ thu chi trên máy này?\n${data.gardens.length} vườn, ${data.transactions.length} khoản (tiền ra ${formatVnd(t.expense)}).\nNên sao lưu ra file trước. Không hoàn tác được.`,
    )
    if (!ok) return
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

      <section className="card">
        <h2>Nơi lưu</h2>
        <p>{data.meta.storage_mode === 'sync' ? '☁️ Lưu cả trên mạng' : '📱 Chỉ lưu trên máy này'}</p>
        <p className="small muted">Lưu cả trên mạng (đổi máy không mất) sẽ có ở bản sau.</p>
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
