import type { Ledger, StorageMode } from '@nhanong/shared'

/** Hỏi 1 lần khi mở sổ lần đầu: lưu ở đâu. Không dùng chữ "local/server/sync". */
export function ChooseMode({ ledger, onChosen }: { ledger: Ledger; onChosen?: (mode: StorageMode) => void }) {
  const choose = async (mode: StorageMode) => {
    await ledger.setMeta({ storage_mode: mode })
    onChosen?.(mode)
  }

  return (
    <div className="ledger">
      <h1>Sổ thu chi của bạn lưu ở đâu?</h1>
      <p className="muted">Bạn có thể đổi lại sau trong phần Cài đặt.</p>
      <button type="button" className="mode-card" onClick={() => choose('local')}>
        <span className="mode-icon" aria-hidden>
          📱
        </span>
        <span>
          <b>Chỉ lưu trên máy này</b>
          <span className="muted">Không ai khác xem được. Nhớ sao lưu ra file thỉnh thoảng, đổi máy thì nhập lại.</span>
        </span>
      </button>
      <button type="button" className="mode-card" disabled>
        <span className="mode-icon" aria-hidden>
          ☁️
        </span>
        <span>
          <b>Lưu cả trên mạng (đổi máy không mất)</b>
          <span className="muted">Sắp có. Cần đăng nhập bằng số điện thoại.</span>
        </span>
      </button>
    </div>
  )
}
