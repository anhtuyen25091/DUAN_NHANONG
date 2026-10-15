import {
  CONTRACT_STATUS_LABELS,
  contractSettlement,
  contractSummaries,
  CUT_GRADES,
  cutKg,
  cutValue,
  formatDate,
  formatQty,
  formatVnd,
  telHref,
  today,
  type CutLine,
  type Ledger,
  type LedgerSnapshot,
} from '@nhanong/shared'
import { useState, type FormEvent } from 'react'
import { go, href } from '../../hooks'
import { parseQty, qtyText } from '../../ledger/qty'
import { showToast } from '../../ledger/toast'
import { CategoryPicker, GardenPicker, MoneyField } from './fields'
import { DateField } from '../../components/DateField'

/** #/so/ban: các hợp đồng bán cho lái (đang cắt trước) */
export function ContractList({ data }: { data: LedgerSnapshot }) {
  const summaries = contractSummaries(data)
  const gardens = new Map(data.gardens.map((g) => [g.id, g.name]))
  const depositLeft = summaries.reduce((s, x) => s + x.depositLeft, 0)

  return (
    <div className="ledger">
      <a className="back" href={href('so')}>
        ‹ Sổ thu chi
      </a>
      <h1>🤝 Bán cho lái</h1>
      <p className="small muted">Dùng khi lái đặt cọc trước rồi vào cắt nhiều đợt (sầu riêng…). Cọc chưa tính vào lời/lỗ; mỗi đợt cắt ghi tiền vào bằng giá trị hàng của đợt.</p>

      {summaries.length > 0 && (
        <section className="card">
          <p className="small muted">Cọc của lái còn chưa trừ</p>
          <p className="big">{formatVnd(depositLeft)}</p>
        </section>
      )}
      {summaries.length === 0 && <div className="notice">Chưa có hợp đồng nào. Bấm “＋ Nhận cọc” khi lái đặt cọc vườn.</div>}

      <div className="garden-list">
        {summaries.map(({ contract, cuts, delivered, depositLeft }) => (
          <a key={contract.id} className={`card garden-row${contract.status === 'open' ? '' : ' faded-row'}`} href={href(`so/ban/${contract.id}`)}>
            <span className="garden-name">
              🤝 {contract.buyer}
              <span className="small muted">
                {' '}
                · {gardens.get(contract.garden_id) ?? 'Vườn đã xóa'} · {cuts.length} đợt · {CONTRACT_STATUS_LABELS[contract.status]}
              </span>
              {contract.status === 'open' && depositLeft > 0 && <span className="tag">Cọc còn {formatVnd(depositLeft)}</span>}
            </span>
            <span className="profit gain">{formatVnd(delivered)}</span>
          </a>
        ))}
      </div>

      <a className="fab" href={href('so/ban/moi')}>
        ＋ Nhận cọc
      </a>
    </div>
  )
}

/** #/so/ban/moi, #/so/ban/:id/sua (?vuon=id: chọn sẵn vườn) */
export function ContractForm({ ledger, data, id, query }: { ledger: Ledger; data: LedgerSnapshot; id?: string; query: URLSearchParams }) {
  const contract = data.harvest_contracts.find((c) => c.id === id)
  const firstGarden = query.get('vuon') ?? data.meta.last_garden_id ?? data.gardens[0]?.id ?? null
  const [gardenId, setGardenId] = useState<string | null>(contract?.garden_id ?? (data.gardens.some((g) => g.id === firstGarden) ? firstGarden : (data.gardens[0]?.id ?? null)))
  const [buyer, setBuyer] = useState(contract?.buyer ?? '')
  const [phone, setPhone] = useState(contract?.phone ?? '')
  const [crop, setCrop] = useState(contract?.crop ?? data.gardens.find((g) => g.id === gardenId)?.crop ?? '')
  const [deposit, setDeposit] = useState(contract?.deposit ?? 0)
  const [date, setDate] = useState(contract?.date ?? today())
  const [categoryId, setCategoryId] = useState(contract?.category_id ?? data.categories.find((c) => c.type === 'income' && c.name === 'Bán nông sản')?.id ?? data.categories.find((c) => c.type === 'income')!.id)
  const [note, setNote] = useState(contract?.note ?? '')
  const [error, setError] = useState<string | null>(null)

  if (data.gardens.length === 0)
    return (
      <div className="ledger">
        <div className="notice">
          Thêm vườn trước rồi mới ghi hợp đồng bán. <a href={href('so/vuon-moi')}>＋ Thêm vườn</a>
        </div>
      </div>
    )

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!gardenId) return
    setError(null)
    const input = { buyer, phone, crop, deposit, date, category_id: categoryId, note }
    try {
      if (contract) {
        await ledger.updateContract(contract.id, input)
        go(`so/ban/${contract.id}`)
      } else {
        const created = await ledger.addContract({ ...input, garden_id: gardenId })
        showToast({ message: `Đã ghi nhận cọc ${formatVnd(deposit)} của lái ${buyer.trim()}` })
        go(`so/ban/${created.id}`)
      }
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <form className="form ledger" onSubmit={submit}>
      <a className="back" href={href(contract ? `so/ban/${contract.id}` : 'so/ban')}>
        ‹ Quay lại
      </a>
      <h1>{contract ? 'Sửa hợp đồng' : 'Nhận cọc của lái'}</h1>
      {!contract && <GardenPicker data={data} value={gardenId} onChange={(g) => g && setGardenId(g)} legend="Bán vườn nào *" />}
      <label>
        Tên lái *
        <input value={buyer} onChange={(e) => setBuyer(e.target.value)} required maxLength={80} placeholder="Ví dụ: Lái Tư Chợ Gạo" />
      </label>
      <label>
        Số điện thoại
        <input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} />
      </label>
      <label>
        Cây / giống
        <input value={crop} onChange={(e) => setCrop(e.target.value)} maxLength={60} placeholder="Ví dụ: Sầu riêng Ri6, Monthong" />
      </label>
      <MoneyField label="Tiền cọc" value={deposit} onChange={setDeposit} />
      <DateField label="Ngày nhận cọc" value={date} onChange={setDate} max={today()} />
      <CategoryPicker data={data} type="income" value={categoryId} onChange={setCategoryId} legend="Ghi tiền các đợt cắt vào hạng mục" />
      <label>
        Ghi chú
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Ví dụ: bao cả vườn, giá theo chợ từng đợt" />
      </label>
      <p className="small muted">Tiền cọc chưa tính vào lời/lỗ. Mỗi đợt cắt sẽ trừ dần cọc theo số hai bên thỏa thuận.</p>
      {error && <div className="notice error">{error}</div>}
      <button type="submit" className="wide primary" disabled={!buyer.trim() || !gardenId}>
        Lưu
      </button>
    </form>
  )
}

/** #/so/ban/:id: tình hình hợp đồng, các đợt cắt, kết thúc */
export function ContractDetail({ ledger, data, id }: { ledger: Ledger; data: LedgerSnapshot; id: string }) {
  const summary = contractSummaries(data).find((s) => s.contract.id === id)
  const [settling, setSettling] = useState(false)
  const [how, setHow] = useState<'deduct' | 'refund' | 'forfeit'>('deduct')
  const [error, setError] = useState<string | null>(null)

  if (!summary)
    return (
      <div className="notice">
        Không tìm thấy hợp đồng này. <a href={href('so/ban')}>Về danh sách</a>
      </div>
    )
  const { contract, cuts, delivered, kg, deducted, depositLeft, paidByCuts } = summary
  const garden = data.gardens.find((g) => g.id === contract.garden_id)
  const open = contract.status === 'open'
  const settlement = contractSettlement(summary, data.transactions)
  const canDeduct = settlement.deductRoom >= depositLeft
  const choice = depositLeft > 0 && !canDeduct && how === 'deduct' ? 'refund' : how

  const run = async (action: () => Promise<unknown>, message: string) => {
    setError(null)
    try {
      await action()
      setSettling(false)
      showToast({ message })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const remove = async () => {
    if (!window.confirm(`Xóa hợp đồng với lái ${contract.buyer}? ${cuts.length} đợt cắt và tiền vào của các đợt cũng bị xóa.`)) return
    const undo = await ledger.removeContract(id)
    showToast({ message: 'Đã xóa hợp đồng', undo })
    go('so/ban')
  }

  return (
    <div className="ledger">
      <a className="back" href={href('so/ban')}>
        ‹ Bán cho lái
      </a>
      <div className="title-row">
        <h1>🤝 {contract.buyer}</h1>
        <a className="button subtle" href={href(`so/ban/${id}/sua`)}>
          Sửa
        </a>
      </div>
      <p className="muted">
        {garden ? <a href={href(`so/vuon/${garden.id}`)}>🌳 {garden.name}</a> : 'Vườn đã xóa'}
        {contract.crop && ` · ${contract.crop}`} · cọc ngày {formatDate(contract.date)} · <b>{CONTRACT_STATUS_LABELS[contract.status]}</b>
        {contract.closed_on && ` (${formatDate(contract.closed_on)})`}
      </p>
      {contract.phone && (
        <p>
          <a className="button" href={telHref(contract.phone)}>
            📞 Gọi {contract.phone}
          </a>
        </p>
      )}

      <section className="card profit-card gain">
        <p className="small muted">Tiền hàng đã giao ({cuts.length} đợt · {formatQty(kg)} kg)</p>
        <p className="big">{formatVnd(delivered)}</p>
        <div className="split">
          <span>
            Cọc <b>{formatVnd(contract.deposit)}</b>
          </span>
          <span>
            Đã trừ cọc <b>{formatVnd(deducted)}</b>
          </span>
          <span>
            Lái trả thêm <b>{formatVnd(paidByCuts)}</b>
          </span>
        </div>
        {open && <p className={`small ${depositLeft > 0 ? 'out' : 'muted'}`}>Cọc còn chưa trừ: {formatVnd(depositLeft)}</p>}
      </section>

      {open && (
        <a className="button primary wide" href={href(`so/ban/${id}/dot-moi`)}>
          ✂️ Ghi đợt cắt
        </a>
      )}

      <h2 className="section">Các đợt cắt</h2>
      {cuts.length === 0 && <p className="muted">Chưa có đợt nào.</p>}
      <div className="entries">
        {cuts.map((cut, i) => (
          <a key={cut.id} className="entry entry-main" href={href(`so/ban/${id}/dot/${cut.id}`)}>
            <span className="entry-icon" aria-hidden>
              ✂️
            </span>
            <span className="entry-text">
              <span>
                Đợt {i + 1} · {formatDate(cut.date)}
              </span>
              <span className="small muted">
                {cut.lines.map((l) => `${l.grade} ${formatQty(l.kg)} kg × ${formatVnd(l.price)}`).join(' · ')}
                {cut.deposit_deduct > 0 && ` · trừ cọc ${formatVnd(cut.deposit_deduct)}`}
              </span>
            </span>
            <span className="amount in">+{formatVnd(cutValue(cut.lines))}</span>
          </a>
        ))}
      </div>

      {open && !settling && (
        <button type="button" className="wide primary" onClick={() => setSettling(true)}>
          ✅ Hoàn tất hợp đồng
        </button>
      )}
      {open && settling && (
        <section className="card settle">
          <h2>Quyết toán với lái {contract.buyer}</h2>
          <dl>
            <div>
              <dt>Tiền hàng {cuts.length} đợt ({formatQty(kg)} kg)</dt>
              <dd>{formatVnd(delivered)}</dd>
            </div>
            <div>
              <dt>Tiền cọc</dt>
              <dd>{formatVnd(contract.deposit)}</dd>
            </div>
            <div>
              <dt>Đã trừ cọc vào các đợt</dt>
              <dd>{formatVnd(deducted)}</dd>
            </div>
            <div>
              <dt>
                <b>Cọc còn dư</b>
              </dt>
              <dd className={depositLeft > 0 ? 'out' : ''}>{formatVnd(depositLeft)}</dd>
            </div>
          </dl>
          {depositLeft > 0 && (
            <fieldset className="form">
              <legend>Phần cọc dư {formatVnd(depositLeft)} xử lý thế nào?</legend>
              <label className="radio-card">
                <input type="radio" name="settle" checked={choice === 'deduct'} disabled={!canDeduct} onChange={() => setHow('deduct')} />
                <span>
                  <b>Trừ nốt vào tiền hàng</b>
                  <span className="small muted">
                    {canDeduct
                      ? `Lái đã trả tiền hàng sau khi trừ đủ cọc. App trừ thêm vào đợt cuối trước; lái thực trả tổng ${formatVnd(delivered)}.`
                      : `Không đủ: tiền hàng chỉ còn ${formatVnd(settlement.deductRoom)} để trừ.`}
                  </span>
                </span>
              </label>
              <label className="radio-card">
                <input type="radio" name="settle" checked={choice === 'refund'} onChange={() => setHow('refund')} />
                <span>
                  <b>Trả lại lái {formatVnd(depositLeft)}</b>
                  <span className="small muted">Không đổi lời/lỗ. Đền thêm cho lái thì dùng "Trả lại cọc" ở dưới.</span>
                </span>
              </label>
              <label className="radio-card">
                <input type="radio" name="settle" checked={choice === 'forfeit'} onChange={() => setHow('forfeit')} />
                <span>
                  <b>Lái bỏ cọc {formatVnd(depositLeft)}</b>
                  <span className="small muted">Phần cọc dư thành tiền vào của vườn.</span>
                </span>
              </label>
            </fieldset>
          )}
          <div className="actions">
            <button type="button" className="primary" onClick={() => run(() => ledger.settleContract(id, choice), `Đã hoàn tất hợp đồng với lái ${contract.buyer}`)}>
              Xác nhận hoàn tất
            </button>
            <button type="button" onClick={() => setSettling(false)}>
              Hủy
            </button>
          </div>
          {depositLeft > 0 && <RefundWithPenalty depositLeft={depositLeft} onRefund={(amount) => run(() => ledger.refundDeposit(id, amount), `Đã ghi trả lại cọc ${formatVnd(amount)}`)} />}
        </section>
      )}
      {!open && (
        <section className="card settle">
          <h2>📋 Quyết toán</h2>
          <dl>
            <div>
              <dt>Tiền hàng {cuts.length} đợt ({formatQty(kg)} kg)</dt>
              <dd className="in">{formatVnd(delivered)}</dd>
            </div>
            {settlement.forfeited > 0 && (
              <div>
                <dt>Lái bỏ cọc</dt>
                <dd className="in">+{formatVnd(settlement.forfeited)}</dd>
              </div>
            )}
            {settlement.refunded > 0 && (
              <div>
                <dt>Trả lại cọc cho lái</dt>
                <dd>{formatVnd(settlement.refunded)}</dd>
              </div>
            )}
            {settlement.penalty > 0 && (
              <div>
                <dt>Đền thêm cho lái</dt>
                <dd className="out">-{formatVnd(settlement.penalty)}</dd>
              </div>
            )}
            <div>
              <dt>Tiền lái thực trả (cọc + các đợt − trả lại)</dt>
              <dd>{formatVnd(settlement.received)}</dd>
            </div>
            <div>
              <dt>
                <b>Tính vào lời/lỗ của vườn</b>
              </dt>
              <dd className="in">
                <b>{formatVnd(settlement.profit)}</b>
              </dd>
            </div>
          </dl>
          {kg > 0 && <p className="small muted">Giá bình quân: {formatVnd(Math.round(delivered / kg))}/kg</p>}
          <button type="button" className="wide" onClick={() => run(() => ledger.reopenContract(id), 'Đã mở lại hợp đồng')}>
            Mở lại hợp đồng
          </button>
        </section>
      )}
      {error && <div className="notice error">{error}</div>}

      <button type="button" className="wide danger-outline" onClick={remove}>
        Xóa hợp đồng
      </button>
    </div>
  )
}

/** Trả lại cọc kèm tiền đền (mình không bán nữa, phải đền cho lái) */
function RefundWithPenalty({ depositLeft, onRefund }: { depositLeft: number; onRefund: (amount: number) => void }) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(depositLeft)
  if (!open)
    return (
      <p className="small">
        <button type="button" className="linklike" onClick={() => setOpen(true)}>
          Trả lại cọc kèm tiền đền…
        </button>
      </p>
    )
  return (
    <div className="form switch-mode">
      <MoneyField label="Số tiền trả lại lái" value={amount} onChange={setAmount} />
      {amount > depositLeft && <p className="small out">Đền thêm {formatVnd(amount - depositLeft)}: ghi thành tiền ra của vườn.</p>}
      <button type="button" className="wide primary" onClick={() => onRefund(amount)}>
        Ghi trả lại cọc
      </button>
    </div>
  )
}

type LineDraft = { grade: string; kg: string; price: number }
const toDraft = (l: CutLine): LineDraft => ({ grade: l.grade, kg: qtyText(l.kg), price: l.price })

/** #/so/ban/:id/dot-moi, #/so/ban/:id/dot/:cutId: ghi đợt cắt nhiều loại hàng */
export function CutForm({ ledger, data, contractId, id }: { ledger: Ledger; data: LedgerSnapshot; contractId: string; id?: string }) {
  const summary = contractSummaries(data).find((s) => s.contract.id === contractId)
  const cut = data.harvest_cuts.find((c) => c.id === id)
  // Dòng mặc định: giá lấy theo đợt trước (giá thường gần nhau)
  const previous = summary?.cuts.filter((c) => c.id !== id).at(-1)
  const [lines, setLines] = useState<LineDraft[]>(
    cut ? cut.lines.map(toDraft) : previous ? previous.lines.map((l) => ({ ...toDraft(l), kg: '' })) : [{ grade: 'Loại A', kg: '', price: 0 }],
  )
  const [date, setDate] = useState(cut?.date ?? today())
  const [deduct, setDeduct] = useState(cut?.deposit_deduct ?? 0)
  const [note, setNote] = useState(cut?.note ?? '')
  const [error, setError] = useState<string | null>(null)

  if (!summary)
    return (
      <div className="notice">
        Không tìm thấy hợp đồng. <a href={href('so/ban')}>Về danh sách</a>
      </div>
    )
  const parsed: CutLine[] = lines.map((l) => ({ grade: l.grade, kg: parseQty(l.kg), price: l.price }))
  const value = cutValue(parsed.filter((l) => l.kg > 0))
  // Cọc có thể trừ ở đợt này = cọc còn lại (cộng lại số đợt này đang trừ khi sửa)
  const canDeduct = Math.min(summary.contract.deposit - summary.deducted + (cut?.deposit_deduct ?? 0), value)
  const setLine = (i: number, patch: Partial<LineDraft>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const back = `so/ban/${contractId}`

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      if (cut) await ledger.updateCut(cut.id, { lines: parsed, date, deposit_deduct: deduct, note })
      else await ledger.addCut({ contract_id: contractId, lines: parsed, date, deposit_deduct: deduct, note })
      showToast({ message: `Đã lưu đợt cắt: ${formatVnd(value)}` })
      go(back)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const remove = async () => {
    if (!cut) return
    const undo = await ledger.removeCut(cut.id)
    showToast({ message: 'Đã xóa đợt cắt', undo })
    go(back)
  }

  return (
    <form className="form ledger" onSubmit={submit}>
      <a className="back" href={href(back)}>
        ‹ Lái {summary.contract.buyer}
      </a>
      <h1>{cut ? 'Sửa đợt cắt' : '✂️ Ghi đợt cắt'}</h1>
      <DateField label="Ngày cắt" value={date} onChange={setDate} max={today()} />

      <fieldset>
        <legend>Hàng cắt đợt này</legend>
        <datalist id="cut-grades">
          {CUT_GRADES.map((g) => (
            <option key={g} value={g} />
          ))}
        </datalist>
        {lines.map((l, i) => (
          <div key={i} className="cut-line">
            <input aria-label="Loại hàng" value={l.grade} onChange={(e) => setLine(i, { grade: e.target.value })} list="cut-grades" maxLength={30} />
            <span className="with-suffix">
              <input aria-label={`Số kg ${l.grade}`} inputMode="decimal" value={l.kg} onChange={(e) => setLine(i, { kg: e.target.value.replace(/[^\d.,]/g, '') })} placeholder="0" />
              <span className="muted">kg</span>
            </span>
            <span className="with-suffix">
              <input
                aria-label={`Giá 1 kg ${l.grade}`}
                inputMode="numeric"
                value={l.price ? l.price.toLocaleString('vi-VN') : ''}
                onChange={(e) => setLine(i, { price: Number(e.target.value.replace(/\D/g, '')) || 0 })}
                placeholder="Giá/kg"
              />
              <span className="muted">đ/kg</span>
            </span>
            <span className="cut-line-total">{formatVnd(Math.round(parseQty(l.kg) * l.price))}</span>
            {lines.length > 1 && (
              <button type="button" className="entry-del" aria-label={`Bỏ dòng ${l.grade}`} onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                ✕
              </button>
            )}
          </div>
        ))}
        <div className="actions">
          {CUT_GRADES.filter((g) => !lines.some((l) => l.grade === g)).map((g) => (
            <button key={g} type="button" onClick={() => setLines([...lines, { grade: g, kg: '', price: 0 }])}>
              ＋ {g}
            </button>
          ))}
        </div>
      </fieldset>

      <section className="card">
        <p className="small muted">Tiền hàng đợt này ({formatQty(cutKg(parsed.filter((l) => l.kg > 0)))} kg)</p>
        <p className="big in">{formatVnd(value)}</p>
      </section>

      <MoneyField label={`Trừ cọc đợt này (cọc còn ${formatVnd(summary.contract.deposit - summary.deducted + (cut?.deposit_deduct ?? 0))})`} value={deduct} onChange={setDeduct} />
      {canDeduct > 0 && (
        <div className="actions">
          <button type="button" onClick={() => setDeduct(canDeduct)}>
            Trừ {formatVnd(canDeduct)}
          </button>
          <button type="button" onClick={() => setDeduct(0)}>
            Không trừ
          </button>
        </div>
      )}
      <p>
        Lái trả thêm đợt này: <b>{formatVnd(Math.max(0, value - deduct))}</b>
      </p>
      <label>
        Ghi chú
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
      </label>
      {error && <div className="notice error">{error}</div>}
      <button type="submit" className="wide primary" disabled={value <= 0}>
        Lưu đợt cắt
      </button>
      {cut && (
        <button type="button" className="wide danger-outline" onClick={remove}>
          Xóa đợt này
        </button>
      )}
    </form>
  )
}
