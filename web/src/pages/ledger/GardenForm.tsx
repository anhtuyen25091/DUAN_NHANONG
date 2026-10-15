import type { Ledger, LedgerSnapshot } from '@nhanong/shared'
import { useState, type FormEvent } from 'react'
import { go, href } from '../../hooks'
import { extraTexts, saveExtra } from '@nhanong/shared'
import { CustomFieldInputs } from './extraFields'

/** Thêm vườn mới, hoặc sửa vườn (id) */
export function GardenForm({ ledger, data, id, back }: { ledger: Ledger; data: LedgerSnapshot; id?: string; back?: string | null }) {
  const garden = data.gardens.find((g) => g.id === id)
  const [name, setName] = useState(garden?.name ?? '')
  const [crop, setCrop] = useState(garden?.crop ?? '')
  const [area, setArea] = useState(garden?.area_m2 ? String(garden.area_m2) : '')
  const [note, setNote] = useState(garden?.note ?? '')
  const [extra, setExtra] = useState(() => extraTexts(data.custom_fields, 'garden', garden?.extra))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const input = { name, crop, note, area_m2: Number(area.replace(/\D/g, '')) || null }
    if (garden) {
      await ledger.updateGarden(garden.id, input)
      await saveExtra(ledger, data.custom_fields, 'garden', garden.id, extra)
      go(`so/vuon/${garden.id}`)
    } else {
      const created = await ledger.addGarden(input)
      await saveExtra(ledger, data.custom_fields, 'garden', created.id, extra)
      go(back ?? `so/vuon/${created.id}`)
    }
  }

  return (
    <form className="form ledger" onSubmit={submit}>
      <a className="back" href={href(garden ? `so/vuon/${garden.id}` : 'so')}>
        ‹ Quay lại
      </a>
      <h1>{garden ? 'Sửa vườn' : 'Thêm vườn'}</h1>
      <label>
        Tên vườn *
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} placeholder="Ví dụ: Vườn sau nhà, Rẫy trên đồi" autoFocus />
      </label>
      <label>
        Cây trồng
        <input value={crop} onChange={(e) => setCrop(e.target.value)} maxLength={60} placeholder="Ví dụ: Cà phê, Sầu riêng" />
      </label>
      <label>
        Diện tích (m²)
        <input value={area} onChange={(e) => setArea(e.target.value)} inputMode="numeric" placeholder="Ví dụ: 5000 (= nửa hécta)" />
      </label>
      <label>
        Ghi chú
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
      </label>
      <CustomFieldInputs fields={data.custom_fields} target="garden" texts={extra} onChange={setExtra} />
      <p className="small muted">
        Muốn ghi thêm thông tin riêng (số gốc cây, giống…)? Vào <a href={href('so/o-tu-them')}>Cài đặt sổ → Thông tin tự thêm</a>.
      </p>
      <button type="submit" className="wide primary" disabled={!name.trim()}>
        Lưu
      </button>
    </form>
  )
}
