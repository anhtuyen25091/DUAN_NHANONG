import {
  CONTRACT_STATUS_LABELS,
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
      <label>
        Ngày nhận cọc
        <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} />
      </label>
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
  const [ending, setEnding] = useState<null | 'refund'>(null)
  const [refund, setRefund] = useState(summary?.depositLeft ?? 0)
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

  const run = async (action: () => Promise<unknown>, message: string) => {
    setError(null)
    try {
      await action()
      setEnding(null)
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

      {open ? (
        <section className="card">
          <h2>Kết thúc hợp đồng</h2>
          {depositLeft === 0 ? (
            <button type="button" className="wide primary" onClick={() => run(() => ledger.closeContract(id), 'Đã đóng hợp đồng')}>
              ✅ Cắt xong, đóng hợp đồng
            </button>
          ) : (
            <p className="small muted">Còn {formatVnd(depositLeft)} cọc chưa trừ: trừ vào đợt cuối, hoặc chọn một cách dưới đây.</p>
          )}
          {depositLeft > 0 && (
            <div className="actions">
              <button
                type="button"
                onClick={() =>
                  window.confirm(`Lái ${contract.buyer} bỏ cọc? ${formatVnd(depositLeft)} cọc còn lại sẽ ghi thành tiền vào của vườn.`) &&
                  run(() => ledger.forfeitDeposit(id), `Đã ghi lái bỏ cọc: +${formatVnd(depositLeft)}`)
                }
              >
                Lái bỏ cọc
              </button>
              <button type="button" onClick={() => setEnding(ending ? null : 'refund')}>
                Trả lại cọc
              </button>
            </div>
          )}
          {ending === 'refund' && (
            <form
              className="form switch-mode"
              onSubmit={(e) => {
                e.preventDefault()
                void run(() => ledger.refundDeposit(id, refund), `Đã ghi trả lại cọc ${formatVnd(refund)}`)
              }}
            >
              <MoneyField label="Số tiền trả lại lái" value={refund} onChange={setRefund} />
              {refund > depositLeft && <p className="small out">Đền thêm {formatVnd(refund - depositLeft)}: ghi thành tiền ra của vườn.</p>}
              <button type="submit" className="wide primary">
                Ghi trả lại cọc
              </button>
            </form>
          )}
        </section>
      ) : (
        <button type="button" className="wide" onClick={() => run(() => ledger.reopenContract(id), 'Đã mở lại hợp đồng')}>
          Mở lại hợp đồng
        </button>
      )}
      {error && <div className="notice error">{error}</div>}

      <button type="button" className="wide danger-outline" onClick={remove}>
        Xóa hợp đồng
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
      <label>
        Ngày cắt
        <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} />
      </label>

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
