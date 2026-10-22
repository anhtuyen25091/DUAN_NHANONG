import { formatDate, formatKg, formatVnd, itemsText, today, type TradeRow, type TradeTotals } from '@nhanong/shared'
import { DateField } from '../../components/DateField'
import { href } from '../../hooks'
import type { useRange } from './useRange'

/** Phần dùng chung của sổ giao dịch và trang doanh nghiệp */

export function RangeFields({ range }: { range: ReturnType<typeof useRange> }) {
  return (
    <div className="range-fields">
      <DateField label="Từ ngày" value={range.from} onChange={range.setFrom} max={range.to} />
      <DateField label="Đến ngày" value={range.to} onChange={range.setTo} min={range.from} max={today()} />
    </div>
  )
}

export function TotalsCard({ totals }: { totals: TradeTotals }) {
  return (
    <section className="card">
      <dl className="deal-totals">
        <div>
          <dt>Mua vào ({formatKg(totals.buy.kg)} kg)</dt>
          <dd>{formatVnd(totals.buy.amount)}</dd>
        </div>
        {totals.buy.owing > 0 && (
          <div>
            <dt>Còn nợ khách</dt>
            <dd className="out">{formatVnd(totals.buy.owing)}</dd>
          </div>
        )}
        <div>
          <dt>Bán ra ({formatKg(totals.sell.kg)} kg)</dt>
          <dd>{formatVnd(totals.sell.amount)}</dd>
        </div>
        {totals.sell.owing > 0 && (
          <div>
            <dt>Khách còn nợ mình</dt>
            <dd className="in">{formatVnd(totals.sell.owing)}</dd>
          </div>
        )}
      </dl>
      <p className="small muted">{totals.count} giao dịch</p>
    </section>
  )
}

/** 1 giao dịch: phiếu → mở phiếu; đợt cân → mở đơn mua bán (chủ doanh nghiệp mở đơn của lái ở chế độ chỉ xem) */
export function TradeRowCard({ row: r }: { row: TradeRow }) {
  const link = r.source === 'deal' && r.deal ? href(`don/${r.deal}`) : href(`giao-dich/phieu/${r.id}`)
  return (
    <a className="card garden-row trade-row" href={link}>
      <span className="garden-name">
        {r.kind === 'buy' ? '🛒' : '📦'} {r.counterpart}
        <span className="small muted">
          {' '}
          · {formatDate(r.date, true)} · {r.code}
          {r.member && ` · lái ${r.member.name}`}
        </span>
        <br />
        <span className="small">{itemsText(r.items)}</span>
        {r.owing > 0 && <span className="tag overdue">{r.kind === 'buy' ? 'Còn nợ khách' : 'Khách nợ'} {formatVnd(r.owing)}</span>}
        {r.pending && <span className="tag">Chờ bên kia xác nhận</span>}
        {r.over_limit && <span className="tag overdue">⚠️ Vượt giá chốt</span>}
      </span>
      <span className="profit">{formatVnd(r.amount)}</span>
    </a>
  )
}
