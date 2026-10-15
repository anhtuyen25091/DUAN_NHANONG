import {
  DEBT_KIND_LABELS,
  debtsByParty,
  debtStatus,
  debtSummary,
  formatDate,
  formatVnd,
  interestPaid,
  monthlyInterest,
  telHref,
  today,
  type DebtKind,
  type Ledger,
  type LedgerSnapshot,
} from '@nhanong/shared'
import { useState, type FormEvent } from 'react'
import { go, href } from '../../hooks'
import { showToast } from '../../ledger/toast'
import { CategoryPicker, GardenPicker, MoneyField } from './fields'

const KIND_ICON: Record<DebtKind, string> = { loan: '🏦', payable: '🔴', receivable: '🟢' }
const partyHref = (kind: DebtKind, party: string) => href(`so/no/nguoi/${kind}/${encodeURIComponent(party)}`)

/** #/so/no: ai nợ ai, còn bao nhiêu (gom theo người: cửa hàng mua thiếu nhiều lần hiện 1 dòng) */
export function DebtList({ data }: { data: LedgerSnapshot }) {
  const [showPaid, setShowPaid] = useState(false)
  const statuses = debtStatus(data, today())
  const sum = debtSummary(statuses)
  const groups = debtsByParty(statuses).filter((g) => (showPaid ? g.left <= 0 : g.left > 0))

  return (
    <div className="ledger">
      <a className="back" href={href('so')}>
        ‹ Sổ thu chi
      </a>
      <h1>🧾 Công nợ &amp; tiền vay</h1>

      <section className="card split-3">
        <div>
          <p className="small muted">🏦 Tiền vay còn nợ</p>
          <p className="big out">{formatVnd(sum.loan)}</p>
        </div>
        <div>
          <p className="small muted">🔴 Còn nợ cửa hàng</p>
          <p className="big out">{formatVnd(sum.payable)}</p>
        </div>
        <div>
          <p className="small muted">🟢 Người ta còn nợ mình</p>
          <p className="big in">{formatVnd(sum.receivable)}</p>
        </div>
      </section>

      <nav className="segmented" aria-label="Lọc">
        <button type="button" className={!showPaid ? 'active' : ''} aria-pressed={!showPaid} onClick={() => setShowPaid(false)}>
          Còn nợ
        </button>
        <button type="button" className={showPaid ? 'active' : ''} aria-pressed={showPaid} onClick={() => setShowPaid(true)}>
          Đã trả xong
        </button>
      </nav>

      {groups.length === 0 && <p className="muted">{showPaid ? 'Chưa có khoản nào trả xong.' : 'Không còn khoản nợ nào. Bấm “＋ Ghi nợ / vay” khi vay tiền, mua thiếu hoặc bán chịu.'}</p>}
      <div className="garden-list">
        {groups.map((g) => (
          <a key={`${g.kind}|${g.party}`} className="card garden-row" href={g.count === 1 ? href(`so/no/${g.statuses[0].debt.id}`) : partyHref(g.kind, g.party)}>
            <span className="garden-name">
              {KIND_ICON[g.kind]} {g.party}
              <span className="small muted">
                {' '}
                · {g.kind === 'loan' ? 'mình vay' : g.kind === 'payable' ? 'mình nợ' : 'nợ mình'}
                {g.count > 1 ? ` · ${g.count} lần` : ` · ${formatDate(g.statuses[0].debt.date)}`}
              </span>
              {g.overdue && <span className="tag overdue">Quá hạn</span>}
            </span>
            <span className={`profit ${g.kind === 'receivable' ? 'gain' : 'loss'}`}>{formatVnd(showPaid ? g.amount : g.left)}</span>
          </a>
        ))}
      </div>

      <a className="fab" href={href('so/no/moi')}>
        ＋ Ghi nợ / vay
      </a>
    </div>
  )
}

/** #/so/no/nguoi/:kind/:party: các lần nợ của 1 người (cửa hàng mua thiếu nhiều lần), trả gộp */
export function PartyDebts({ ledger, data, kind, party }: { ledger: Ledger; data: LedgerSnapshot; kind: DebtKind; party: string }) {
  const group = debtsByParty(debtStatus(data, today())).find((g) => g.kind === kind && g.party === party)
  const [amount, setAmount] = useState(group?.left ?? 0)
  const [date, setDate] = useState(today())
  const [error, setError] = useState<string | null>(null)

  if (!group)
    return (
      <div className="notice">
        Không còn khoản nợ nào với {party}. <a href={href('so/no')}>Về công nợ</a>
      </div>
    )
  const receive = kind === 'receivable'

  const pay = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const n = await ledger.payParty({ kind, party, amount, date })
      showToast({ message: `Đã ghi ${receive ? 'thu' : 'trả'} ${formatVnd(amount)} cho ${n} lần nợ${amount === group.left ? '. Đã hết nợ 🎉' : ''}` })
      setAmount(group.left - amount)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="ledger">
      <a className="back" href={href('so/no')}>
        ‹ Công nợ
      </a>
      <h1>
        {KIND_ICON[kind]} {party}
      </h1>
      <p className="muted">
        {DEBT_KIND_LABELS[kind]} · {group.count} lần
      </p>
      {group.phone && (
        <p>
          <a className="button" href={telHref(group.phone)}>
            📞 Gọi {group.phone}
          </a>
        </p>
      )}
      <section className={`card profit-card ${receive ? 'gain' : 'loss'}`}>
        <p className="small muted">{receive ? 'Còn phải thu' : 'Mình còn nợ'}</p>
        <p className="big">{formatVnd(group.left)}</p>
        <div className="split">
          <span>
            Tổng nợ <b>{formatVnd(group.amount)}</b>
          </span>
          <span>
            Đã {receive ? 'thu' : 'trả'} <b>{formatVnd(group.amount - group.left)}</b>
          </span>
        </div>
      </section>

      {group.left > 0 && (
        <form className="form card" onSubmit={pay}>
          <h2>{receive ? 'Thu gộp' : 'Trả gộp'}</h2>
          <p className="small muted">Trừ vào lần nợ cũ nhất trước.</p>
          <MoneyField label="Số tiền" value={amount} onChange={setAmount} />
          <div className="actions">
            <button type="button" onClick={() => setAmount(group.left)}>
              {receive ? 'Thu hết' : 'Trả hết'} {formatVnd(group.left)}
            </button>
          </div>
          <label>
            Ngày
            <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} />
          </label>
          {error && <div className="notice error">{error}</div>}
          <button type="submit" className="wide primary" disabled={amount <= 0}>
            Lưu
          </button>
        </form>
      )}

      <h2 className="section">Các lần nợ</h2>
      <div className="garden-list">
        {group.statuses
          .slice()
          .sort((a, b) => a.debt.date.localeCompare(b.debt.date))
          .map(({ debt, left, overdue }) => (
            <a key={debt.id} className="card garden-row" href={href(`so/no/${debt.id}`)}>
              <span className="garden-name">
                {formatDate(debt.date)}
                <span className="small muted"> · {debt.note ?? formatVnd(debt.amount)}</span>
                {overdue && <span className="tag overdue">Quá hạn</span>}
              </span>
              <span className={`profit ${receive ? 'gain' : 'loss'}`}>{left > 0 ? formatVnd(left) : 'Đã trả'}</span>
            </a>
          ))}
      </div>
    </div>
  )
}

/** #/so/no/moi, #/so/no/:id/sua */
export function DebtForm({ ledger, data, id }: { ledger: Ledger; data: LedgerSnapshot; id?: string }) {
  const debt = data.debts.find((d) => d.id === id)
  const [kind, setKind] = useState<DebtKind>(debt?.kind ?? 'payable')
  const [party, setParty] = useState(debt?.party ?? '')
  const [phone, setPhone] = useState(debt?.phone ?? '')
  const [amount, setAmount] = useState(debt?.amount ?? 0)
  const [date, setDate] = useState(debt?.date ?? today())
  const [dueOn, setDueOn] = useState(debt?.due_on ?? '')
  const [gardenId, setGardenId] = useState<string | null>(debt ? debt.garden_id : null)
  const [note, setNote] = useState(debt?.note ?? '')
  const [recordEntry, setRecordEntry] = useState(true)
  const [rate, setRate] = useState(debt?.interest_rate ? String(debt.interest_rate).replace('.', ',') : '')
  const loan = kind === 'loan'
  const type = kind === 'receivable' ? 'income' : 'expense'
  const [categoryId, setCategoryId] = useState('')
  const category = data.categories.find((c) => c.id === categoryId && c.type === type) ?? data.categories.find((c) => c.type === type)!
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const interestRate = Number(rate.replace(',', '.')) || null
    const input = { party, phone, amount, date, due_on: dueOn || null, garden_id: gardenId, note, ...(loan ? { interest_rate: interestRate } : {}) }
    try {
      if (debt) {
        await ledger.updateDebt(debt.id, input)
        go(`so/no/${debt.id}`)
      } else {
        const created = await ledger.addDebt({ ...input, kind, record_entry: recordEntry, category_id: category.id })
        showToast({ message: `Đã ghi nợ ${formatVnd(amount)} với ${party.trim()}` })
        go(`so/no/${created.id}`)
      }
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <form className="form ledger" onSubmit={submit}>
      <a className="back" href={href(debt ? `so/no/${debt.id}` : 'so/no')}>
        ‹ Quay lại
      </a>
      <h1>{debt ? 'Sửa khoản nợ' : 'Ghi nợ'}</h1>
      {!debt && (
        <div className="type-switch" role="tablist">
          <button type="button" role="tab" aria-selected={kind === 'payable'} className={kind === 'payable' ? 'active out' : ''} onClick={() => setKind('payable')}>
            Mình mua thiếu
          </button>
          <button type="button" role="tab" aria-selected={kind === 'receivable'} className={kind === 'receivable' ? 'active in' : ''} onClick={() => setKind('receivable')}>
            Mình bán chịu
          </button>
          <button type="button" role="tab" aria-selected={loan} className={loan ? 'active out' : ''} onClick={() => setKind('loan')}>
            Mình đi vay
          </button>
        </div>
      )}
      {loan && <p className="small muted">Tiền vay là tiền mượn nên không tính vào lời/lỗ. Mỗi lần trả, tiền lãi sẽ ghi thành tiền ra (hạng mục 🏦 Lãi vay).</p>}
      {kind === 'payable' && !debt && <p className="small muted">Mua phân, thuốc thiếu: nên ghi ở Kho vật tư → Mua vật tư → “Mua thiếu” để biết cả số bao.</p>}
      <label>
        {loan ? 'Vay của ai (ngân hàng, người quen) *' : kind === 'payable' ? 'Nợ ai (đại lý, cửa hàng) *' : 'Ai nợ (thương lái, người mua) *'}
        <input
          value={party}
          onChange={(e) => setParty(e.target.value)}
          required
          maxLength={80}
          list="debt-parties"
          placeholder={loan ? 'Ví dụ: Agribank, Quỹ tín dụng' : kind === 'payable' ? 'Ví dụ: Đại lý Hai Lúa' : 'Ví dụ: Thương lái Tư'}
        />
        <datalist id="debt-parties">
          {[...new Set(data.debts.filter((d) => d.kind === kind).map((d) => d.party))].map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </label>
      <label>
        Số điện thoại
        <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} />
      </label>
      <MoneyField label={loan ? 'Số tiền vay *' : 'Số tiền *'} value={amount} onChange={setAmount} required />
      {loan && (
        <label>
          Lãi suất (%/năm)
          <input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="Ví dụ: 9" />
          {Number(rate.replace(',', '.')) > 0 && amount > 0 && <span className="small muted">Lãi ước tính mỗi tháng: {formatVnd(monthlyInterest(amount, Number(rate.replace(',', '.'))))}</span>}
        </label>
      )}
      <div className="row-2">
        <label>
          Ngày
          <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} />
        </label>
        <label>
          Hẹn trả ngày
          <input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
        </label>
      </div>
      {data.gardens.length > 0 && <GardenPicker data={data} value={gardenId} onChange={setGardenId} allowShared legend={loan ? 'Tiền lãi tính cho vườn nào (vay chung cho các vườn: chọn Chi chung)' : 'Vườn'} />}
      {!debt && !loan && (
        <>
          <label className="checkbox">
            <input type="checkbox" checked={recordEntry} onChange={(e) => setRecordEntry(e.target.checked)} />
            Ghi luôn vào sổ thu chi ({kind === 'payable' ? 'tiền ra' : 'tiền vào'}, tính vào lời/lỗ)
          </label>
          {!recordEntry && <p className="small muted">Bỏ chọn khi khoản này đã ghi trong sổ rồi, để không bị tính 2 lần.</p>}
          {recordEntry && <CategoryPicker data={data} type={type} value={category.id} onChange={setCategoryId} />}
        </>
      )}
      <label>
        Ghi chú
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={kind === 'payable' ? 'Ví dụ: 10 bao phân, trả sau thu hoạch' : 'Ví dụ: 2 tấn cà phê'} />
      </label>
      {error && <div className="notice error">{error}</div>}
      <button type="submit" className="wide primary" disabled={!party.trim() || amount <= 0}>
        Lưu
      </button>
    </form>
  )
}

/** #/so/no/:id: còn nợ bao nhiêu, các lần trả, ghi lần trả mới */
export function DebtDetail({ ledger, data, id }: { ledger: Ledger; data: LedgerSnapshot; id: string }) {
  const status = debtStatus(data, today()).find((s) => s.debt.id === id)
  const isLoan = status?.debt.kind === 'loan'
  // Khoản vay: mặc định trả lãi 1 tháng, gốc để trống; nợ thường: trả hết
  const [amount, setAmount] = useState(isLoan ? 0 : (status?.left ?? 0))
  const [interest, setInterest] = useState(isLoan ? monthlyInterest(status!.left, status!.debt.interest_rate) : 0)
  const [date, setDate] = useState(today())
  const [error, setError] = useState<string | null>(null)

  if (!status)
    return (
      <div className="notice">
        Không tìm thấy khoản nợ này. <a href={href('so/no')}>Về công nợ</a>
      </div>
    )
  const { debt, paid, left, overdue } = status
  const payments = data.debt_payments.filter((p) => p.debt_id === id)
  const payable = debt.kind !== 'receivable'
  const loanInterest = interestPaid({ debt_payments: payments })
  const garden = data.gardens.find((g) => g.id === debt.garden_id)
  const supply = data.supplies.find((s) => s.id === debt.supply_id)

  const pay = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await ledger.payDebt({ debt_id: id, amount, interest, date })
      showToast({ message: `Đã ghi ${payable ? 'trả' : 'thu'} ${formatVnd(amount)}${interest > 0 ? ` + lãi ${formatVnd(interest)}` : ''}${amount === left ? '. Đã hết nợ 🎉' : ''}` })
      setAmount(isLoan ? 0 : left - amount)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const remove = async () => {
    if (!window.confirm(`Xóa khoản nợ với ${debt.party}?${debt.transaction_id ? ' Khoản thu chi đi kèm cũng bị xóa.' : ''}`)) return
    const undo = await ledger.removeDebt(id)
    showToast({ message: 'Đã xóa khoản nợ', undo })
    go('so/no')
  }

  return (
    <div className="ledger">
      <a className="back" href={href('so/no')}>
        ‹ Công nợ
      </a>
      <div className="title-row">
        <h1>
          {debt.kind === 'loan' ? '🏦' : payable ? '🔴' : '🟢'} {debt.party}
        </h1>
        <a className="button subtle" href={href(`so/no/${id}/sua`)}>
          Sửa
        </a>
      </div>
      <p className="muted">
        {DEBT_KIND_LABELS[debt.kind]} · {formatDate(debt.date)}
        {garden && ` · ${garden.name}`}
        {debt.note && ` · ${debt.note}`}
      </p>
      {debt.phone && (
        <p>
          <a className="button" href={telHref(debt.phone)}>
            📞 Gọi {debt.phone}
          </a>
        </p>
      )}
      {supply && (
        <p>
          <a href={href(`so/kho/${supply.id}`)}>📦 Xem vật tư: {supply.name}</a>
        </p>
      )}

      <section className={`card profit-card ${payable ? 'loss' : 'gain'}`}>
        <p className="small muted">{left > 0 ? (payable ? 'Mình còn nợ' : 'Còn phải thu') : 'Đã trả xong'}</p>
        <p className="big">{formatVnd(left)}</p>
        <div className="split">
          <span>
            Tổng nợ <b>{formatVnd(debt.amount)}</b>
          </span>
          <span>
            Đã {payable ? 'trả' : 'thu'} <b>{formatVnd(paid)}</b>
          </span>
        </div>
        {debt.due_on && <p className={`small ${overdue ? 'out' : 'muted'}`}>Hẹn trả: {formatDate(debt.due_on)}{overdue ? ' (quá hạn)' : ''}</p>}
        {isLoan && (
          <p className="small muted">
            {debt.interest_rate ? `Lãi suất ${String(debt.interest_rate).replace('.', ',')}%/năm · ước tính ${formatVnd(monthlyInterest(left, debt.interest_rate))}/tháng · ` : ''}
            Lãi đã trả {formatVnd(loanInterest)}
          </p>
        )}
      </section>

      {left > 0 && (
        <form className="form card" onSubmit={pay}>
          <h2>{payable ? 'Ghi lần trả nợ' : 'Ghi lần thu nợ'}</h2>
          <MoneyField label={isLoan ? 'Tiền gốc trả (để 0 nếu chỉ trả lãi)' : 'Số tiền'} value={amount} onChange={setAmount} />
          {isLoan && <MoneyField label="Tiền lãi trả (tính vào tiền ra)" value={interest} onChange={setInterest} />}
          <div className="actions">
            <button type="button" onClick={() => setAmount(left)}>
              {payable ? 'Trả hết' : 'Thu hết'} {formatVnd(left)}
            </button>
          </div>
          <label>
            Ngày
            <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} />
          </label>
          {error && <div className="notice error">{error}</div>}
          <button type="submit" className="wide primary" disabled={amount + interest <= 0}>
            Lưu
          </button>
          <p className="small muted">
            {isLoan ? 'Tiền gốc không tính vào lời/lỗ; tiền lãi ghi thành tiền ra.' : `Trả/thu nợ không tính lại vào lời/lỗ: tiền đã tính lúc ${payable ? 'mua' : 'bán'}.`}
          </p>
        </form>
      )}

      <h2 className="section">Các lần {payable ? 'trả' : 'thu'}</h2>
      {payments.length === 0 && <p className="muted">Chưa có lần nào.</p>}
      <div className="entries">
        {payments.map((p) => (
          <div key={p.id} className="entry">
            <span className="entry-main">
              <span className="entry-icon" aria-hidden>
                💵
              </span>
              <span className="entry-text">
                <span>{formatDate(p.date)}</span>
                {p.note && <span className="small muted">{p.note}</span>}
              </span>
              <span className="amount">
                {formatVnd(p.amount)}
                {p.interest ? <span className="small out"> + lãi {formatVnd(p.interest)}</span> : null}
              </span>
            </span>
            <button
              type="button"
              className="entry-del"
              aria-label="Xóa lần trả này"
              onClick={async () => {
                const undo = await ledger.removePayment(p.id)
                showToast({ message: `Đã xóa lần ${payable ? 'trả' : 'thu'} ${formatVnd(p.amount)}`, undo })
              }}
            >
              🗑
            </button>
          </div>
        ))}
      </div>

      <button type="button" className="wide danger-outline" onClick={remove}>
        Xóa khoản nợ này
      </button>
    </div>
  )
}
