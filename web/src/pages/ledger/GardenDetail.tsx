import {
  allocatedEntries,
  filterEntries,
  formatDate,
  formatQty,
  formatVnd,
  monthlyTotals,
  seasonRange,
  seasonsOf,
  supplyUsedValue,
  today,
  totals,
  type Ledger,
  type LedgerSnapshot,
} from '@nhanong/shared'
import { go, href, replaceQuery } from '../../hooks'
import { MonthBars } from '../../components/MonthBars'
import { showToast } from '../../ledger/toast'
import { EntryList } from './EntryList'
import { ProfitCard } from './LedgerHome'

/**
 * Một vườn (id = "chung": các khoản chi chung).
 * Chế độ Nâng cao: chọn xem theo vụ (?vu=id), danh sách vụ, vật tư đã dùng.
 */
export function GardenDetail({ ledger, data, id, query }: { ledger: Ledger; data: LedgerSnapshot; id: string; query: URLSearchParams }) {
  const garden = data.gardens.find((g) => g.id === id)
  const gardenId = id === 'chung' ? null : id

  if (gardenId && !garden)
    return (
      <div className="notice">
        Không tìm thấy vườn này. <a href={href('so')}>Về sổ thu chi</a>
      </div>
    )

  const advanced = !!data.meta.advanced
  const year = today().slice(0, 4)
  const seasons = gardenId ? seasonsOf(data.seasons, gardenId) : []
  // Mặc định xem vụ đang làm (nếu có), không thì năm nay
  const view = query.get('vu') ?? (advanced && seasons.find((s) => !s.ended_on)?.id) ?? 'nam'
  const season = seasons.find((s) => s.id === view)
  const range: { from?: string; to?: string } = season ? seasonRange(season) : view === 'tat-ca' ? {} : { from: `${year}-01-01` }
  const label = season ? `${season.name} (${formatDate(season.started_on)} – ${season.ended_on ? formatDate(season.ended_on) : 'nay'})` : view === 'tat-ca' ? 'Từ trước tới nay' : `Năm ${year}`

  // Lời/lỗ tính cả vật tư lấy từ kho; danh sách chỉ hiện khoản ghi thật
  const allocated = filterEntries(allocatedEntries(data), { gardenId })
  // Chế độ Cơ bản: danh sách hiện mọi khoản như trước; Nâng cao: theo vụ / năm đang chọn
  const listRange: { from?: string; to?: string } = advanced && garden ? range : {}
  const entries = filterEntries(data.transactions, { gardenId, ...listRange })
  const usages = data.supply_usages.filter(
    (u) => u.garden_id === gardenId && (!listRange.from || u.used_on >= listRange.from) && (!listRange.to || u.used_on <= listRange.to),
  )
  const supplies = new Map(data.supplies.map((s) => [s.id, s]))

  const remove = async () => {
    if (!garden) return
    const undo = await ledger.removeGarden(garden.id)
    showToast({ message: `Đã xóa ${garden.name}. Các khoản của vườn chuyển sang chi chung.`, undo })
    go('so')
  }

  const endSeason = async () => {
    if (!season) return
    try {
      await ledger.updateSeason(season.id, { ended_on: today() })
      showToast({ message: `Đã kết thúc ${season.name}` })
    } catch (err) {
      showToast({ message: (err as Error).message })
    }
  }

  return (
    <div className="ledger">
      <a className="back" href={href('so')}>
        ‹ Sổ thu chi
      </a>
      <div className="title-row">
        <h1>{garden ? `🌳 ${garden.name}` : '📦 Chi chung'}</h1>
        {garden && (
          <a className="button subtle" href={href(`so/vuon/${garden.id}/sua`)}>
            Sửa
          </a>
        )}
      </div>
      {garden && (garden.crop || garden.area_m2) && (
        <p className="muted">{[garden.crop, garden.area_m2 ? `${garden.area_m2.toLocaleString('vi-VN')} m²` : null].filter(Boolean).join(' · ')}</p>
      )}

      {advanced && garden ? (
        <>
          <nav className="segmented wrap" aria-label="Xem theo">
            {seasons.map((s) => (
              <button key={s.id} type="button" className={s.id === view ? 'active' : ''} aria-pressed={s.id === view} onClick={() => replaceQuery(`so/vuon/${id}`, { vu: s.id })}>
                {s.ended_on ? '' : '🌱 '}
                {s.name}
              </button>
            ))}
            <button type="button" className={view === 'nam' ? 'active' : ''} aria-pressed={view === 'nam'} onClick={() => replaceQuery(`so/vuon/${id}`, { vu: 'nam' })}>
              Năm {year}
            </button>
            <button type="button" className={view === 'tat-ca' ? 'active' : ''} aria-pressed={view === 'tat-ca'} onClick={() => replaceQuery(`so/vuon/${id}`, { vu: 'tat-ca' })}>
              Tất cả
            </button>
          </nav>
          <ProfitCard label={label} {...totals(filterEntries(allocated, range))} />
          <div className="actions">
            <a className="button" href={href(`so/vuon/${id}/vu-moi`)}>
              ＋ Thêm vụ
            </a>
            {season && (
              <a className="button subtle" href={href(`so/vuon/${id}/vu/${season.id}`)}>
                Sửa vụ
              </a>
            )}
            {season && !season.ended_on && (
              <button type="button" onClick={endSeason}>
                Kết thúc vụ hôm nay
              </button>
            )}
          </div>
          {seasons.length === 0 && <p className="small muted">Chia theo vụ để biết mỗi vụ lời hay lỗ (ví dụ vụ cà phê từ tháng 5 năm nay đến tháng 4 năm sau).</p>}
          {gardenId && supplyUsedValue(data, gardenId, range) > 0 && (
            <p className="small muted">Trong đó vật tư lấy từ kho: {formatVnd(supplyUsedValue(data, gardenId, range))}</p>
          )}
        </>
      ) : (
        <>
          <ProfitCard label={`Năm ${year}`} {...totals(filterEntries(allocated, { from: `${year}-01-01` }))} />
          <ProfitCard label="Từ trước tới nay" {...totals(allocated)} />
        </>
      )}

      <section className="card">
        <h2>6 tháng gần đây</h2>
        <MonthBars months={monthlyTotals(allocated, 6, today())} />
      </section>

      {usages.length > 0 && (
        <>
          <h2 className="section">Vật tư đã dùng</h2>
          <div className="entries">
            {usages.map((u) => {
              const s = supplies.get(u.supply_id)
              return (
                <a key={u.id} className="entry entry-main" href={href(`so/kho/${u.supply_id}`)}>
                  <span className="entry-icon" aria-hidden>
                    📦
                  </span>
                  <span className="entry-text">
                    <span>{s?.name ?? 'Vật tư'}</span>
                    <span className="small muted">
                      {formatDate(u.used_on)} · {formatQty(u.quantity)} {s?.unit}
                    </span>
                  </span>
                  <span className="amount out">-{formatVnd(Math.round(u.quantity * (s?.unit_price ?? 0)))}</span>
                </a>
              )
            })}
          </div>
        </>
      )}

      <h2 className="section">Các khoản đã ghi</h2>
      <EntryList ledger={ledger} data={data} entries={entries} />

      {garden && (
        <button type="button" className="wide danger-outline" onClick={remove}>
          Xóa vườn này
        </button>
      )}

      <a className="fab" href={href('so/ghi', { vuon: gardenId ?? undefined, ve: `so/vuon/${id}` })}>
        ＋ Ghi tiền
      </a>
    </div>
  )
}
