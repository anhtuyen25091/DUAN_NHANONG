import { filterEntries, formatVnd, paginate, totals, type EntryType, type Ledger, type LedgerSnapshot } from '@nhanong/shared'
import { useEffect } from 'react'
import { Pager } from '../../components/Pager'
import { href, replaceQuery } from '../../hooks'
import { EntryList } from './EntryList'

const PER_PAGE = 20

/** #/so/khoan?loai=thu|chi&vuon=id|chung&trang=n: mọi khoản thu chi, lọc + phân trang */
export function AllEntries({ ledger, data, query }: { ledger: Ledger; data: LedgerSnapshot; query: URLSearchParams }) {
  const kind = query.get('loai')
  const type: EntryType | undefined = kind === 'thu' ? 'income' : kind === 'chi' ? 'expense' : undefined
  const vuon = query.get('vuon')
  const gardenId = vuon === 'chung' ? null : vuon && data.gardens.some((g) => g.id === vuon) ? vuon : undefined
  const filtered = filterEntries(data.transactions, { type, gardenId })
  const { items, page, pages, total } = paginate(filtered, Number(query.get('trang')), PER_PAGE)
  const sum = totals(filtered)

  const set = (next: Record<string, string | null>) => replaceQuery('so/khoan', { loai: kind, vuon, trang: null, ...next })
  // Sang trang khác thì về đầu danh sách
  useEffect(() => {
    // Không trả giá trị của scrollTo (Chrome mới trả Promise, React sẽ hiểu nhầm là hàm dọn dẹp)
    window.scrollTo({ top: 0 })
  }, [page])

  return (
    <div className="ledger">
      <a className="back" href={href('so')}>
        ‹ Sổ thu chi
      </a>
      <h1>Tất cả khoản thu chi</h1>

      <nav className="segmented" aria-label="Loại">
        {[
          [null, 'Tất cả'],
          ['thu', 'Tiền vào'],
          ['chi', 'Tiền ra'],
        ].map(([value, label]) => (
          <button key={label} type="button" className={kind === value ? 'active' : ''} aria-pressed={kind === value} onClick={() => set({ loai: value })}>
            {label}
          </button>
        ))}
      </nav>
      {data.gardens.length > 0 && (
        <label className="filter-select">
          Vườn
          <select value={vuon ?? ''} onChange={(e) => set({ vuon: e.target.value || null })}>
            <option value="">Mọi vườn</option>
            {data.gardens.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
            <option value="chung">Chi chung</option>
          </select>
        </label>
      )}

      <p className="small muted">
        {total} khoản
        {type !== 'expense' && <> · tiền vào <b className="in">{formatVnd(sum.income)}</b></>}
        {type !== 'income' && <> · tiền ra <b className="out">{formatVnd(sum.expense)}</b></>}
      </p>

      <EntryList ledger={ledger} data={data} entries={items} showGarden={gardenId === undefined} />
      <Pager page={page} pages={pages} onPage={(p) => set({ trang: String(p) })} />

      <a className="fab" href={href('so/ghi', { ve: 'so/khoan' })}>
        ＋ Ghi tiền
      </a>
    </div>
  )
}
