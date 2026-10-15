import { suggestSeasonName, today, type Ledger, type LedgerSnapshot } from '@nhanong/shared'
import { useState, type FormEvent } from 'react'
import { go, href } from '../../hooks'
import { showToast } from '../../ledger/toast'

/** #/so/vuon/:gardenId/vu-moi, #/so/vuon/:gardenId/vu/:id */
export function SeasonForm({ ledger, data, gardenId, id }: { ledger: Ledger; data: LedgerSnapshot; gardenId: string; id?: string }) {
  const season = data.seasons.find((s) => s.id === id)
  const garden = data.gardens.find((g) => g.id === gardenId)
  const [startedOn, setStartedOn] = useState(season?.started_on ?? today())
  const [name, setName] = useState(season?.name ?? suggestSeasonName(data.seasons, gardenId, startedOn))
  const [endedOn, setEndedOn] = useState(season?.ended_on ?? '')
  const [error, setError] = useState<string | null>(null)
  const back = `so/vuon/${gardenId}`

  if (!garden)
    return (
      <div className="notice">
        Không tìm thấy vườn này. <a href={href('so')}>Về sổ thu chi</a>
      </div>
    )

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const input = { name, started_on: startedOn, ended_on: endedOn || null }
      if (season) await ledger.updateSeason(season.id, input)
      else await ledger.addSeason({ ...input, garden_id: gardenId })
      go(back, { vu: season?.id })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const remove = async () => {
    if (!season) return
    const undo = await ledger.removeSeason(season.id)
    showToast({ message: `Đã xóa ${season.name}. Các khoản thu chi vẫn giữ nguyên.`, undo })
    go(back)
  }

  return (
    <form className="form ledger" onSubmit={submit}>
      <a className="back" href={href(back)}>
        ‹ {garden.name}
      </a>
      <h1>{season ? 'Sửa vụ' : 'Thêm vụ mới'}</h1>
      <p className="small muted">Các khoản của vườn ghi trong khoảng ngày của vụ sẽ tự tính vào vụ, không cần chọn lại.</p>
      <label>
        Tên vụ *
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} placeholder="Ví dụ: Vụ cà phê 2026" />
      </label>
      <div className="row-2">
        <label>
          Bắt đầu *
          <input type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value || today())} required />
        </label>
        <label>
          Kết thúc
          <input type="date" value={endedOn} min={startedOn} onChange={(e) => setEndedOn(e.target.value)} />
        </label>
      </div>
      <p className="small muted">Để trống ngày kết thúc nếu vụ đang làm.</p>
      {error && <div className="notice error">{error}</div>}
      <button type="submit" className="wide primary" disabled={!name.trim()}>
        Lưu
      </button>
      {season && (
        <button type="button" className="wide danger-outline" onClick={remove}>
          Xóa vụ này
        </button>
      )}
    </form>
  )
}
