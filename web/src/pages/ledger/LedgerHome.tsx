import { filterEntries, formatVnd, totals, type Ledger, type LedgerSnapshot } from '@nhanong/shared'
import { useState } from 'react'
import { href } from '../../hooks'
import { PERIOD_LABELS, periodRange, type Period } from '../../ledger/period'
import { EntryList } from './EntryList'
import { SyncBadge } from './SyncBadge'

export function LedgerHome({ ledger, data }: { ledger: Ledger; data: LedgerSnapshot }) {
  const [period, setPeriod] = useState<Period>('year')
  const range = periodRange(period)
  const inPeriod = filterEntries(data.transactions, range)
  const all = totals(inPeriod)
  const shared = totals(filterEntries(inPeriod, { gardenId: null }))
  const hasShared = inPeriod.some((t) => t.garden_id === null)

  return (
    <div className="ledger">
      <div className="title-row">
        <h1>Sổ thu chi</h1>
        <a className="button subtle" href={href('so/cai-dat')} aria-label="Cài đặt sổ">
          ⚙️ Cài đặt
        </a>
      </div>
      <SyncBadge />

      <nav className="segmented" aria-label="Thời gian">
        {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
          <button key={p} type="button" className={p === period ? 'active' : ''} aria-pressed={p === period} onClick={() => setPeriod(p)}>
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </nav>

      <ProfitCard label={`Tất cả các vườn · ${PERIOD_LABELS[period].toLowerCase()}`} {...all} />

      <h2 className="section">Vườn của tôi</h2>
      {data.gardens.length === 0 && (
        <div className="notice">
          <p>Chưa có vườn nào. Thêm vườn để biết mỗi vườn lời hay lỗ.</p>
          <div className="actions">
            <a className="button primary" href={href('so/vuon-moi')}>
              ＋ Thêm vườn
            </a>
            <button type="button" onClick={() => ledger.createSampleGarden()}>
              Dùng vườn mẫu để bấm thử
            </button>
          </div>
        </div>
      )}
      <div className="garden-list">
        {data.gardens.map((g) => {
          const t = totals(filterEntries(inPeriod, { gardenId: g.id }))
          return (
            <a key={g.id} className="card garden-row" href={href(`so/vuon/${g.id}`)}>
              <span className="garden-name">
                🌳 {g.name}
                {g.crop && <span className="small muted"> · {g.crop}</span>}
              </span>
              <span className={`profit ${t.profit >= 0 ? 'gain' : 'loss'}`}>
                {t.profit >= 0 ? 'Lời ' : 'Lỗ '}
                {formatVnd(Math.abs(t.profit))}
              </span>
            </a>
          )
        })}
        {hasShared && (
          <a className="card garden-row" href={href('so/vuon/chung')}>
            <span className="garden-name">📦 Chi chung (không thuộc vườn nào)</span>
            <span className={`profit ${shared.profit >= 0 ? 'gain' : 'loss'}`}>{formatVnd(shared.profit)}</span>
          </a>
        )}
        {data.gardens.length > 0 && (
          <a className="button" href={href('so/vuon-moi')}>
            ＋ Thêm vườn
          </a>
        )}
      </div>

      <h2 className="section">Ghi gần đây</h2>
      <EntryList ledger={ledger} data={data} entries={data.transactions.slice(0, 15)} showGarden />

      <a className="fab" href={href('so/ghi')}>
        ＋ Ghi tiền
      </a>
    </div>
  )
}

export function ProfitCard({ label, income, expense, profit }: { label: string; income: number; expense: number; profit: number }) {
  return (
    <section className={`card profit-card ${profit >= 0 ? 'gain' : 'loss'}`}>
      <p className="small muted">{label}</p>
      <p className="big">
        {profit >= 0 ? 'Lời ' : 'Lỗ '}
        {formatVnd(Math.abs(profit))}
      </p>
      <div className="split">
        <span>
          Tiền vào <b className="in">{formatVnd(income)}</b>
        </span>
        <span>
          Tiền ra <b className="out">{formatVnd(expense)}</b>
        </span>
      </div>
    </section>
  )
}
