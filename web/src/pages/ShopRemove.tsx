import { ApiError, SHOP_REMOVE_REASONS, type ShopRemoveReason } from '@nhanong/shared'
import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { href } from '../hooks'

const REASONS = Object.keys(SHOP_REMOVE_REASONS) as ShopRemoveReason[]

/** Chủ điểm xin gỡ điểm khỏi danh sách (?id=…&ten=…): admin gọi lại số để kiểm tra rồi ẩn điểm */
export function ShopRemove({ query }: { query: URLSearchParams }) {
  const shopId = Number(query.get('id')) || null
  const shopName = query.get('ten')
  const [reason, setReason] = useState<ShopRemoveReason>('owner')
  const [contact, setContact] = useState('')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [sending, setSending] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSending(true)
    setErrors({})
    try {
      const message = await api.submitShop({ shop_id: shopId, remove: true, remove_reason: reason, contact: contact.trim(), note: note.trim() || null })
      setResult({ ok: true, message })
    } catch (error) {
      if (error instanceof ApiError) setErrors(error.errors)
      setResult({ ok: false, message: (error as Error).message })
    } finally {
      setSending(false)
    }
  }

  if (!shopId) return <div className="notice error">Không rõ điểm cần gỡ.</div>

  if (result?.ok)
    return (
      <>
        <div className="notice">Đã gửi yêu cầu. Nhà Nông sẽ gọi lại số bạn để lại để kiểm tra, rồi ẩn điểm khỏi danh sách.</div>
        <p>
          <a href={href('diem-ban')}>‹ Về danh sách điểm bán</a>
        </p>
      </>
    )

  const error = (key: string) => errors[key] && <span className="field-error">{errors[key][0]}</span>

  return (
    <form className="form" onSubmit={submit}>
      <a className="back" href={href('diem-ban')}>
        ‹ Điểm bán
      </a>
      <h1>Xin gỡ điểm: {shopName ?? ''}</h1>
      <p className="muted small">
        Thông tin điểm này lấy từ danh sách công khai (vd danh sách cơ sở được cấp phép của Sở NN&MT). Nếu bạn là chủ điểm và không muốn hiện ở đây, hoặc
        điểm đã đóng cửa, hãy gửi yêu cầu. Không cần đăng nhập.
      </p>

      <fieldset>
        <legend>Lý do</legend>
        {REASONS.map((r) => (
          <label key={r} className="radio-card">
            <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} /> <span>{SHOP_REMOVE_REASONS[r]}</span>
          </label>
        ))}
        {error('remove_reason')}
      </fieldset>

      <label>
        Số điện thoại để gọi lại kiểm tra *
        <input type="tel" inputMode="tel" value={contact} onChange={(e) => setContact(e.target.value)} required maxLength={50} />
        {error('contact')}
      </label>
      <label>
        Ghi chú
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} />
        {error('note')}
      </label>

      {result && !result.ok && <div className="notice error">{result.message}</div>}

      <button type="submit" className="wide primary" disabled={sending || contact.trim() === ''}>
        {sending ? 'Đang gửi…' : 'Gửi yêu cầu gỡ'}
      </button>
    </form>
  )
}
