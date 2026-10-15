import { formatDate, formatVnd, groupByDate, today, type Ledger, type LedgerSnapshot, type Transaction } from '@nhanong/shared'
import { href } from '../../hooks'
import { showToast } from '../../ledger/toast'

/** Danh sách khoản thu chi, gom theo ngày; bấm để sửa, nút xóa có hoàn tác */
export function EntryList({ ledger, data, entries, showGarden }: { ledger: Ledger; data: LedgerSnapshot; entries: Transaction[]; showGarden?: boolean }) {
  if (entries.length === 0) return <p className="muted">Chưa ghi khoản nào. Bấm “＋ Ghi tiền” ở dưới để bắt đầu.</p>

  const categories = new Map(data.categories.map((c) => [c.id, c]))
  const gardens = new Map(data.gardens.map((g) => [g.id, g]))
  const now = today()

  // Khoản sinh ra khi mua vật tư / ghi nợ: mở vật tư / khoản nợ để sửa, để 2 bên không lệch nhau
  const debtOf = new Map(data.debts.filter((d) => d.transaction_id).map((d) => [d.transaction_id!, d.id]))
  const entryHref = (t: Transaction) =>
    t.supply_id ? href(`so/kho/${t.supply_id}`) : debtOf.has(t.id) ? href(`so/no/${debtOf.get(t.id)}`) : href('so/ghi', { sua: t.id })

  const remove = async (entry: Transaction) => {
    const linked = entry.supply_id ? ' (xóa cả vật tư trong kho)' : debtOf.has(entry.id) ? ' (xóa cả khoản nợ)' : ''
    const undo = await ledger.removeEntry(entry.id)
    showToast({ message: `Đã xóa ${formatVnd(entry.amount)}${linked}`, undo })
  }

  return (
    <div className="entries">
      {groupByDate(entries).map(({ date, entries }) => (
        <section key={date}>
          <h3 className="day">{date === now ? 'Hôm nay' : formatDate(date)}</h3>
          {entries.map((t) => {
            const cat = categories.get(t.category_id)
            return (
              <div key={t.id} className="entry">
                <a className="entry-main" href={entryHref(t)}>
                  <span className="entry-icon" aria-hidden>
                    {cat?.icon ?? '📦'}
                  </span>
                  <span className="entry-text">
                    <span>{cat?.name ?? 'Khác'}</span>
                    <span className="small muted">
                      {[showGarden ? (t.garden_id ? gardens.get(t.garden_id)?.name : 'Chi chung') : null, t.note].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className={`amount ${t.type === 'income' ? 'in' : 'out'}`}>
                    {t.type === 'income' ? '+' : '-'}
                    {formatVnd(t.amount)}
                  </span>
                </a>
                <button type="button" className="entry-del" aria-label="Xóa khoản này" onClick={() => remove(t)}>
                  🗑
                </button>
              </div>
            )
          })}
        </section>
      ))}
    </div>
  )
}
