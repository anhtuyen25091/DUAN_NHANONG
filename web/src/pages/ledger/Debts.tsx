import { DEBT_KIND_LABELS, debtStatus, debtSummary, formatDate, formatVnd, telHref, today, type DebtKind, type Ledger, type LedgerSnapshot } from '@nhanong/shared'
import { useState, type FormEvent } from 'react'
import { go, href } from '../../hooks'
import { showToast } from '../../ledger/toast'
import { CategoryPicker, GardenPicker, MoneyField } from './fields'

/** #/so/no: ai nợ ai, còn bao nhiêu */
export function DebtList({ data }: { data: LedgerSnapshot }) {
  const [showPaid, setShowPaid] = useState(false)
  const statuses = debtStatus(data, today())
  const sum = debtSummary(statuses)
  const shown = statuses.filter((s) => (showPaid ? s.left <= 0 : s.left > 0))

  return (
    <div className="ledger">
      <a className="back" href={href('so')}>
        ‹ Sổ thu chi
      </a>
      <h1>🧾 Công nợ</h1>

      <section className="card split-2">
        <div>
          <p className="small muted">Mình còn nợ người ta</p>
          <p className="big out">{formatVnd(sum.payable)}</p>
        </div>
        <div>
          <p className="small muted">Người ta còn nợ mình</p>
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

      {shown.length === 0 && <p className="muted">{showPaid ? 'Chưa có khoản nào trả xong.' : 'Không còn khoản nợ nào. Bấm “＋ Ghi nợ” khi mua thiếu hoặc bán chịu.'}</p>}
      <div className="garden-list">
        {shown.map(({ debt, left, overdue }) => (
          <a key={debt.id} className="card garden-row" href={href(`so/no/${debt.id}`)}>
            <span className="garden-name">
              {debt.kind === 'payable' ? '🔴' : '🟢'} {debt.party}
              <span className="small muted">
                {' '}
                · {debt.kind === 'payable' ? 'mình nợ' : 'nợ mình'} · {formatDate(debt.date)}
              </span>
              {overdue && <span className="tag overdue">Quá hạn {formatDate(debt.due_on!)}</span>}
            </span>
            <span className={`profit ${debt.kind === 'payable' ? 'loss' : 'gain'}`}>{formatVnd(showPaid ? debt.amount : left)}</span>
          </a>
        ))}
      </div>

      <a className="fab" href={href('so/no/moi')}>
        ＋ Ghi nợ
      </a>
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
  const type = kind === 'payable' ? 'expense' : 'income'
  const [categoryId, setCategoryId] = useState('')
  const category = data.categories.find((c) => c.id === categoryId && c.type === type) ?? data.categories.find((c) => c.type === type)!
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const input = { party, phone, amount, date, due_on: dueOn || null, garden_id: gardenId, note }
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
        </div>
      )}
      <label>
        {kind === 'payable' ? 'Nợ ai (đại lý, cửa hàng) *' : 'Ai nợ (thương lái, người mua) *'}
        <input value={party} onChange={(e) => setParty(e.target.value)} required maxLength={80} placeholder={kind === 'payable' ? 'Ví dụ: Đại lý Hai Lúa' : 'Ví dụ: Thương lái Tư'} />
      </label>
      <label>
        Số điện thoại
        <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} />
      </label>
      <MoneyField label="Số tiền *" value={amount} onChange={setAmount} required />
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
      {data.gardens.length > 0 && <GardenPicker data={data} value={gardenId} onChange={setGardenId} allowShared />}
      {!debt && (
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
  const [amount, setAmount] = useState(status?.left ?? 0)
  const [date, setDate] = useState(today())
  const [error, setError] = useState<string | null>(null)

  if (!status)
    return (
      <div className="notice">
        Không tìm thấy khoản nợ này. <a href={href('so/no')}>Về công nợ</a>
      </div>
    )
  const { debt, paid, left, overdue } = status
  const payable = debt.kind === 'payable'
  const payments = data.debt_payments.filter((p) => p.debt_id === id)
  const garden = data.gardens.find((g) => g.id === debt.garden_id)
  const supply = data.supplies.find((s) => s.id === debt.supply_id)

  const pay = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await ledger.payDebt({ debt_id: id, amount, date })
      showToast({ message: `Đã ghi ${payable ? 'trả' : 'thu'} ${formatVnd(amount)}${amount === left ? '. Đã hết nợ 🎉' : ''}` })
      setAmount(left - amount)
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
          {payable ? '🔴' : '🟢'} {debt.party}
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
      </section>

      {left > 0 && (
        <form className="form card" onSubmit={pay}>
          <h2>{payable ? 'Ghi lần trả nợ' : 'Ghi lần thu nợ'}</h2>
          <MoneyField label="Số tiền" value={amount} onChange={setAmount} />
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
          <button type="submit" className="wide primary" disabled={amount <= 0}>
            Lưu
          </button>
          <p className="small muted">Trả/thu nợ không tính lại vào lời/lỗ: tiền đã tính lúc {payable ? 'mua' : 'bán'}.</p>
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
              <span className="amount">{formatVnd(p.amount)}</span>
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
