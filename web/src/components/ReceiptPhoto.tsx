import { useEffect, useRef, useState } from 'react'
import { photoUrl, savePhoto } from '../ledger/receipts'

/** Ảnh hóa đơn đang gắn với khoản: ảnh thu nhỏ (bấm để xem to) + Xóa ảnh; chưa có thì nút chụp / chọn ảnh */
export function ReceiptPhoto({ photoId, onChange }: { photoId: string | null; onChange: (id: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null)
  // Ảnh đã đọc từ máy, kèm id của nó (đổi ảnh thì ảnh cũ tự không hiện nữa)
  const [loaded, setLoaded] = useState<{ id: string; url: string | null } | null>(null)
  const url = loaded && loaded.id === photoId ? loaded.url : null
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let current: string | null = null
    let cancelled = false
    if (photoId)
      void photoUrl(photoId).then((u) => {
        if (cancelled) {
          if (u) URL.revokeObjectURL(u)
          return
        }
        current = u
        setLoaded({ id: photoId, url: u })
      })
    return () => {
      cancelled = true
      if (current) URL.revokeObjectURL(current)
    }
  }, [photoId])

  const pick = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      onChange(await savePhoto(file))
    } catch {
      setError('Không đọc được ảnh này, thử ảnh khác.')
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="receipt-photo">
      <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void pick(e.target.files?.[0])} />
      {photoId ? (
        <>
          {url ? (
            <a href={url} target="_blank" rel="noreferrer" title="Xem ảnh to">
              <img src={url} alt="Ảnh hóa đơn" />
            </a>
          ) : (
            <span className="small muted">📷 Ảnh đang ở máy khác, sẽ tải về khi đồng bộ</span>
          )}
          <button type="button" className="subtle" onClick={() => onChange(null)}>
            Xóa ảnh
          </button>
        </>
      ) : (
        <button type="button" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Đang xử lý ảnh…' : '📷 Chụp / chọn ảnh hóa đơn'}
        </button>
      )}
      {error && <span className="field-error">{error}</span>}
    </div>
  )
}
