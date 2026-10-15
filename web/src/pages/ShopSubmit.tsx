import { ApiError, SHOP_TYPE_LABELS, type ShopType } from '@nhanong/shared'
import { useState, type FormEvent } from 'react'
import { api } from '../api'
import { href, useAsync } from '../hooks'

const TYPES = Object.keys(SHOP_TYPE_LABELS) as ShopType[]

/** Đề xuất điểm mới, hoặc báo sửa điểm đã có (?sua=id&ten=…) */
export function ShopSubmit({ query }: { query: URLSearchParams }) {
  const shopId = Number(query.get('sua')) || null
  const shopName = query.get('ten')
  const [types, setTypes] = useState<ShopType[]>([])
  const [form, setForm] = useState({ name: '', address: '', province_code: '', phone: '', goods: '', note: '' })
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [sending, setSending] = useState(false)
  const [provinces] = useAsync(() => api.provinces(), [])

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value })
  const toggle = (t: ShopType) => setTypes(types.includes(t) ? types.filter((x) => x !== t) : [...types, t])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSending(true)
    setErrors({})
    try {
      const filled = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() || null]))
      const message = await api.submitShop({ ...filled, shop_id: shopId, types: types.length ? types : undefined })
      setResult({ ok: true, message })
    } catch (error) {
      if (error instanceof ApiError) setErrors(error.errors)
      setResult({ ok: false, message: (error as Error).message })
    } finally {
      setSending(false)
    }
  }

  if (result?.ok)
    return (
      <>
        <div className="notice">{result.message}</div>
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
      <h1>{shopId ? `Báo sai: ${shopName ?? ''}` : 'Thêm điểm bán / thu mua'}</h1>
      <p className="muted small">
        {shopId ? 'Chỉ cần điền phần bị sai.' : 'Điểm mới sẽ hiện sau khi được kiểm tra.'} Không cần đăng nhập.
      </p>

      <fieldset>
        <legend>Loại điểm{shopId ? '' : ' *'}</legend>
        <div className="segmented">
          {TYPES.map((t) => (
            <button key={t} type="button" className={types.includes(t) ? 'active' : ''} aria-pressed={types.includes(t)} onClick={() => toggle(t)}>
              {SHOP_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        {error('types')}
      </fieldset>

      <label>
        Tên cửa hàng / đại lý{shopId ? '' : ' *'}
        <input value={form.name} onChange={set('name')} required={!shopId} maxLength={255} />
        {error('name')}
      </label>
      <label>
        Số điện thoại
        <input type="tel" inputMode="tel" value={form.phone} onChange={set('phone')} maxLength={50} />
        {error('phone')}
      </label>
      <label>
        Địa chỉ
        <input value={form.address} onChange={set('address')} maxLength={255} placeholder="Số nhà, đường, xã" />
        {error('address')}
      </label>
      <label>
        Tỉnh/thành
        <select value={form.province_code} onChange={set('province_code')}>
          <option value="">Chọn tỉnh/thành</option>
          {provinces.status === 'ok' &&
            provinces.data.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
        </select>
        {error('province_code')}
      </label>
      <label>
        Mặt hàng
        <input value={form.goods} onChange={set('goods')} maxLength={255} placeholder="Ví dụ: thu mua cà phê, tiêu; bán phân NPK" />
        {error('goods')}
      </label>
      <label>
        Ghi chú cho người kiểm tra
        <textarea value={form.note} onChange={set('note')} maxLength={500} rows={3} />
        {error('note')}
      </label>

      {result && !result.ok && <div className="notice error">{result.message}</div>}

      <button type="submit" className="wide primary" disabled={sending || (!shopId && types.length === 0)}>
        {sending ? 'Đang gửi…' : 'Gửi'}
      </button>
    </form>
  )
}
