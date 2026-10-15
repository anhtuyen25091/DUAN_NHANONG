import { allocatedEntries, contractSummaries, debtStatus, interestPaid, debtSummary, filterEntries, formatVnd, supplyStock, today, totals, type Ledger, type LedgerSnapshot } from '@nhanong/shared'
import { useState } from 'react'
import { href } from '../../hooks'
import { PERIOD_LABELS, periodRange, type Period } from '../../ledger/period'
import { EntryList } from './EntryList'
import { SyncBadge } from './SyncBadge'

export function LedgerHome({ ledger, data }: { ledger: Ledger; data: LedgerSnapshot }) {
  const [period, setPeriod] = useState<Period>('year')
  const range = periodRange(period)
  // Vật tư lấy từ kho tính vào vườn đã dùng (tổng cả sổ không đổi)
  const inPeriod = filterEntries(allocatedEntries(data), range)
  const all = totals(inPeriod)
  const shared = totals(filterEntries(inPeriod, { gardenId: null }))
  const hasShared = filterEntries(data.transactions, range).some((t) => t.garden_id === null)
  const stockValue = supplyStock(data).reduce((sum, s) => sum + s.leftValue, 0)

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
      {data.meta.advanced && <FinanceCard data={data} profit={all.profit} range={range} periodLabel={PERIOD_LABELS[period].toLowerCase()} />}
      {data.meta.advanced && <AdvancedShortcuts data={data} />}

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
            <span className="garden-name">
              📦 Chi chung (không thuộc vườn nào)
              {stockValue > 0 && <span className="small muted"> · gồm {formatVnd(stockValue)} vật tư còn trong kho</span>}
            </span>
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

/**
 * Tình hình tài chính: lời/lỗ đã gồm phân thuốc mua thiếu và lãi vay;
 * kèm các khoản còn nợ / được nợ để biết sau khi thanh toán hết thì còn bao nhiêu.
 */
function FinanceCard({ data, profit, range, periodLabel }: { data: LedgerSnapshot; profit: number; range: { from?: string }; periodLabel: string }) {
  const debts = debtSummary(debtStatus(data, today()))
  const deposit = contractSummaries(data).reduce((s, c) => s + c.depositLeft, 0)
  const interest = interestPaid(data, range)
  const rows: Array<[string, number, 'in' | 'out']> = [
    ['🏦 Tiền vay còn phải trả (gốc)', debts.loan, 'out'],
    ['🔴 Còn nợ cửa hàng (phân, thuốc mua thiếu)', debts.payable, 'out'],
    ['🟢 Người ta còn nợ mình', debts.receivable, 'in'],
    ['🤝 Cọc lái chưa trừ (còn nợ hàng)', deposit, 'out'],
  ]
  if (rows.every(([, v]) => v === 0) && interest === 0) return null
  return (
    <section className="card finance">
      <h2>Tình hình tài chính</h2>
      <p className="small muted">
        Lời/lỗ {periodLabel} ở trên đã tính cả phân thuốc mua thiếu{interest > 0 ? ` và ${formatVnd(interest)} lãi vay` : ' và lãi vay'}. Tiền gốc vay là tiền mượn nên không tính vào lời/lỗ.
      </p>
      <dl>
        {rows
          .filter(([, v]) => v > 0)
          .map(([label, value, dir]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd className={dir}>{formatVnd(value)}</dd>
            </div>
          ))}
      </dl>
      <p className="small">
        <a href={href('so/no')}>Xem công nợ &amp; tiền vay ›</a>
      </p>
      {profit !== 0 && <p className="small muted">Ghi chú: lời/lỗ là chênh lệch tiền vào – tiền ra; số tiền mặt thực có còn tùy các khoản nợ trên.</p>}
    </section>
  )
}

/** Chế độ Nâng cao: lối tắt vào Kho vật tư và Công nợ, kèm con số chính */
function AdvancedShortcuts({ data }: { data: LedgerSnapshot }) {
  const stock = supplyStock(data)
  const inStock = stock.filter((s) => s.left > 1e-9)
  const debts = debtSummary(debtStatus(data, today()))
  const openContracts = contractSummaries(data).filter((c) => c.contract.status === 'open')
  return (
    <div className="shortcut-grid">
      <a className="card shortcut" href={href('so/ban')}>
        <b>🤝 Bán cho lái</b>
        <span className="small muted">
          {openContracts.length ? `${openContracts.length} lái đang cắt · cọc còn ${formatVnd(openContracts.reduce((s, c) => s + c.depositLeft, 0))}` : 'Lái đặt cọc, cắt nhiều đợt'}
        </span>
      </a>
      <a className="card shortcut" href={href('so/kho')}>
        <b>📦 Kho vật tư</b>
        <span className="small muted">{inStock.length ? `${inStock.length} loại · còn ${formatVnd(inStock.reduce((s, x) => s + x.leftValue, 0))}` : 'Chưa có gì trong kho'}</span>
      </a>
      <a className="card shortcut" href={href('so/no')}>
        <b>🧾 Công nợ</b>
        <span className="small muted">
          {debts.payable || debts.receivable || debts.loan ? (
            <>
              {debts.loan > 0 && <span className="out">Vay {formatVnd(debts.loan)} · </span>}
              {debts.payable > 0 && <span className="out">Nợ {formatVnd(debts.payable)}</span>}
              {debts.payable > 0 && debts.receivable > 0 && ' · '}
              {debts.receivable > 0 && <span className="in">Được nợ {formatVnd(debts.receivable)}</span>}
            </>
          ) : (
            'Không còn nợ'
          )}
        </span>
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
