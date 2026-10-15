import { filterEntries, monthlyTotals, today, totals, type Ledger, type LedgerSnapshot } from '@nhanong/shared'
import { go, href } from '../../hooks'
import { MonthBars } from '../../components/MonthBars'
import { showToast } from '../../ledger/toast'
import { EntryList } from './EntryList'
import { ProfitCard } from './LedgerHome'

/** Một vườn (id = "chung": các khoản chi chung) */
export function GardenDetail({ ledger, data, id }: { ledger: Ledger; data: LedgerSnapshot; id: string }) {
  const garden = data.gardens.find((g) => g.id === id)
  const gardenId = id === 'chung' ? null : id

  if (gardenId && !garden)
    return (
      <div className="notice">
        Không tìm thấy vườn này. <a href={href('so')}>Về sổ thu chi</a>
      </div>
    )

  const entries = filterEntries(data.transactions, { gardenId })
  const year = today().slice(0, 4)

  const remove = async () => {
    if (!garden) return
    const undo = await ledger.removeGarden(garden.id)
    showToast({ message: `Đã xóa ${garden.name}. Các khoản của vườn chuyển sang chi chung.`, undo })
    go('so')
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

      <ProfitCard label={`Năm ${year}`} {...totals(filterEntries(entries, { from: `${year}-01-01` }))} />
      <ProfitCard label="Từ trước tới nay" {...totals(entries)} />

      <section className="card">
        <h2>6 tháng gần đây</h2>
        <MonthBars months={monthlyTotals(entries, 6, today())} />
      </section>

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
