import { DOCUMENT_FORMAT_LABELS, type DocumentFormat, type DocumentTarget } from '@nhanong/shared'
import { useState } from 'react'
import { api } from '../api'
import { showToast } from '../ledger/toast'

/**
 * Nút tải giấy tờ PDF / Word (phiếu, bảng kê, báo cáo). Máy có chia sẻ file (điện thoại) thì có thêm nút "Gửi"
 * để gửi thẳng qua Zalo, Messenger…
 */
export function PrintButtons({ token, target, label = 'In / gửi khách' }: { token: string; target: DocumentTarget; label?: string }) {
  const [busy, setBusy] = useState<string | null>(null)

  const fetchFile = async (format: DocumentFormat): Promise<File> => {
    const { data, filename, mime } = await api.downloadDocument(token, target, format)
    return new File([data], filename, { type: mime })
  }

  const download = async (format: DocumentFormat) => {
    setBusy(format)
    try {
      const file = await fetchFile(format)
      const url = URL.createObjectURL(file)
      const a = document.createElement('a')
      a.href = url
      a.download = file.name
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      showToast({ message: `Đã tải ${file.name}` })
    } catch (err) {
      showToast({ message: (err as Error).message })
    } finally {
      setBusy(null)
    }
  }

  const share = async () => {
    setBusy('share')
    try {
      const file = await fetchFile('pdf')
      await navigator.share({ files: [file], title: file.name })
    } catch (err) {
      if ((err as Error).name !== 'AbortError') showToast({ message: (err as Error).message })
    } finally {
      setBusy(null)
    }
  }
  const canShareFiles = typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([''], 'a.pdf', { type: 'application/pdf' })] })

  return (
    <div className="print-buttons">
      <span className="small muted">{label}</span>
      <div className="btn-row">
        {(['pdf', 'docx'] as const).map((format) => (
          <button key={format} type="button" disabled={busy !== null} onClick={() => download(format)}>
            {busy === format ? 'Đang tạo…' : `${format === 'pdf' ? '📄' : '📝'} Tải ${DOCUMENT_FORMAT_LABELS[format]}`}
          </button>
        ))}
        {canShareFiles && (
          <button type="button" className="primary" disabled={busy !== null} onClick={share}>
            {busy === 'share' ? 'Đang tạo…' : '📤 Gửi PDF'}
          </button>
        )}
      </div>
    </div>
  )
}
