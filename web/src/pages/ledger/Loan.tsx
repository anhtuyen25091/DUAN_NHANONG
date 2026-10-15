import {
  formatDate,
  formatVnd,
  LENDER_TYPE_LABELS,
  LOAN_PLAN_LABELS,
  loanSchedule,
  today,
  VN_BANKS,
  type Debt,
  type DebtPayment,
  type Installment,
  type LenderType,
  type LoanPlan,
} from '@nhanong/shared'
import { loanTermsOf, type LoanDraft } from '../../ledger/loanDraft'

/** Chọn loại bên cho vay; ngân hàng thì chọn tên trong danh sách (điền vào ô tên) */
export function LenderFields({ draft, onChange, party, onParty }: { draft: LoanDraft; onChange: (d: LoanDraft) => void; party: string; onParty: (p: string) => void }) {
  const set = (patch: Partial<LoanDraft>) => onChange({ ...draft, ...patch })
  return (
    <>
      <fieldset>
        <legend>Vay của ai</legend>
        <div className="segmented wrap">
          {(Object.keys(LENDER_TYPE_LABELS) as LenderType[]).map((t) => (
            <button
              key={t}
              type="button"
              className={draft.lenderType === t ? 'active' : ''}
              aria-pressed={draft.lenderType === t}
              // Vay cá nhân thường tính lãi theo tháng
              onClick={() => set({ lenderType: t, rateUnit: t === 'person' ? 'month' : t === 'bank' ? 'year' : draft.rateUnit })}
            >
              {LENDER_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </fieldset>
      {draft.lenderType === 'bank' && (
        <fieldset>
          <legend>Chọn ngân hàng</legend>
          <div className="bank-grid">
            {VN_BANKS.map((b) => (
              <button key={b} type="button" className={party === b ? 'active' : ''} aria-pressed={party === b} onClick={() => onParty(b)}>
                {b}
              </button>
            ))}
          </div>
        </fieldset>
      )}

    </>
  )
}

/** Phần nhập điều khoản vay: lãi suất, cách trả, kỳ hạn + xem trước tổng lãi */
export function LoanFields({
  draft,
  onChange,
  party,
  amount,
  date,
}: {
  draft: LoanDraft
  onChange: (d: LoanDraft) => void
  party: string
  amount: number
  date: string
}) {
  const set = (patch: Partial<LoanDraft>) => onChange({ ...draft, ...patch })
  const terms = loanTermsOf(draft)
  // Xem trước lịch trả nợ với số liệu đang nhập
  const preview =
    amount > 0 && terms.loan_plan
      ? loanSchedule(
          { id: 'preview', kind: 'loan', party, phone: null, amount, date, due_on: null, garden_id: null, transaction_id: null, supply_id: null, note: null, updated_at: '', deleted_at: null, ...terms },
          [],
          today(),
        )
      : null

  return (
    <>
      <div className="row-2">
        <label>
          Lãi suất
          <input inputMode="decimal" value={draft.rate} onChange={(e) => set({ rate: e.target.value.replace(/[^\d.,]/g, '') })} placeholder={draft.rateUnit === 'year' ? 'Ví dụ: 9' : 'Ví dụ: 1,5'} />
        </label>
        <fieldset>
          <legend>Tính theo</legend>
          <div className="segmented">
            {(['year', 'month'] as const).map((u) => (
              <button key={u} type="button" className={draft.rateUnit === u ? 'active' : ''} aria-pressed={draft.rateUnit === u} onClick={() => set({ rateUnit: u })}>
                %/{u === 'year' ? 'năm' : 'tháng'}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <fieldset>
        <legend>Cách trả</legend>
        {(Object.keys(LOAN_PLAN_LABELS) as LoanPlan[]).map((p) => (
          <label key={p} className="radio-card">
            <input type="radio" name="loan-plan" checked={draft.plan === p} onChange={() => set({ plan: p })} />
            <span>
              <b>{LOAN_PLAN_LABELS[p].title}</b>
              <span className="small muted">{LOAN_PLAN_LABELS[p].hint}</span>
            </span>
          </label>
        ))}
        <label className="radio-card">
          <input type="radio" name="loan-plan" checked={draft.plan === ''} onChange={() => set({ plan: '' })} />
          <span>
            <b>Chưa có lịch cố định</b>
            <span className="small muted">Trả lúc nào ghi lúc đó (vay người quen…).</span>
          </span>
        </label>
      </fieldset>

      {draft.plan && (
        <div className="row-2">
          <label>
            Vay trong bao lâu (tháng)
            <input inputMode="numeric" value={draft.term} onChange={(e) => set({ term: e.target.value.replace(/\D/g, '') })} placeholder="Ví dụ: 12" />
            <span className="actions">
              {[6, 11, 12, 24].map((m) => (
                <button key={m} type="button" className={draft.term === String(m) ? 'active-toggle' : ''} onClick={() => set({ term: String(m) })}>
                  {m} tháng
                </button>
              ))}
            </span>
          </label>
          {draft.plan !== 'lump_sum' && (
            <label>
              Trả vào ngày mấy hằng tháng
              <input inputMode="numeric" value={draft.payDay} onChange={(e) => set({ payDay: e.target.value.replace(/\D/g, '').slice(0, 2) })} placeholder={`Ví dụ: ${Number(date.slice(8, 10))}`} />
            </label>
          )}
        </div>
      )}

      {preview && (
        <section className="card loan-preview">
          <p className="small muted">Dự kiến (nếu trả đúng lịch)</p>
          <p>
            Tổng lãi phải trả đến khi tất toán: <b className="out">{formatVnd(preview.interestTotal)}</b>
          </p>
          <p className="small">
            Tổng phải trả: {formatVnd(amount + preview.interestTotal)} · {preview.items.length} kỳ · kỳ đầu {formatDate(preview.items[0].due)}: {formatVnd(preview.items[0].principal + preview.items[0].interest)} ·
            hết hạn {formatDate(preview.items.at(-1)!.due)}
          </p>
        </section>
      )}
    </>
  )
}

/** Lịch trả nợ của khoản vay: từng kỳ, đã trả / quá hạn, tổng lãi đến khi tất toán */
export function LoanScheduleCard({ debt, payments, onPick }: { debt: Debt; payments: DebtPayment[]; onPick: (it: Installment) => void }) {
  const schedule = loanSchedule(debt, payments, today())
  if (!schedule) return null
  const { items, interestTotal, interestPaid, interestLeft, next } = schedule

  return (
    <section className="card">
      <h2>📅 Lịch trả nợ · {debt.loan_plan ? LOAN_PLAN_LABELS[debt.loan_plan].title.toLowerCase() : ''}</h2>
      <p>
        Tổng lãi đến khi tất toán: <b className="out">{formatVnd(interestTotal)}</b>
      </p>
      <p className="small muted">
        Đã trả lãi {formatVnd(interestPaid)} · còn dự kiến {formatVnd(interestLeft)}
        {next && ` · kỳ tới ${formatDate(next.due)}: ${formatVnd(next.principal + next.interest)}`}
      </p>
      <div className="table-wrap">
        <table className="schedule">
          <thead>
            <tr>
              <th>Kỳ</th>
              <th>Ngày trả</th>
              <th className="num">Gốc</th>
              <th className="num">Lãi</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items
              .filter((it) => it.paid || it.principal + it.interest > 0)
              .map((it) => (
                <tr key={it.no} className={it.paid ? 'paid' : it.overdue ? 'overdue' : next?.no === it.no ? 'next' : ''}>
                  <td>{it.no}</td>
                  <td>{formatDate(it.due)}</td>
                  <td className="num">{formatVnd(it.principal)}</td>
                  <td className="num">{formatVnd(it.interest)}</td>
                  <td>
                    {it.paid ? (
                      '✅'
                    ) : (
                      <button type="button" className="linklike" onClick={() => onPick(it)}>
                        {it.overdue ? '⚠️ Trả' : 'Trả'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">Kỳ chưa trả tính theo số còn nợ hiện tại: trả bớt gốc sớm thì lãi các kỳ sau giảm theo.</p>
    </section>
  )
}
