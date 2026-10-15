import { CUT_GRADES, cutValue, formatQty, formatVnd, today, type CutLine, type Deal, type DealEntryInput, type DealEntryKind } from '@nhanong/shared'
import { useState, type FormEvent } from 'react'
import { api } from '../../api'
import { Status } from '../../components/Status'
import { go, href, useAsync } from '../../hooks'
import { parseQty, qtyText } from '../../ledger/qty'
import { showToast } from '../../ledger/toast'
import { MoneyField } from '../ledger/fields'

const TITLES: Record<DealEntryKind, string> = { deposit: '💰 Ghi tiền cọc', cut: '✂️ Ghi đợt cân', payment: '💵 Ghi lần trả tiền', cost: '🧾 Chi phí riêng' }

/** #/don/:uuid/muc-moi?loai=, #/don/:uuid/muc/:entry: ghi / sửa 1 mục của đơn */
export function EntryForm({ token, dealUuid, kind, entryUuid }: { token: string; dealUuid: string; kind?: string; entryUuid?: string }) {
  const [state, retry] = useAsync(() => api.deal(token, dealUuid), [token, dealUuid])
  if (state.status !== 'ok') return <Status state={state} retry={retry} />
  const entry = state.data.entries?.find((e) => e.uuid === entryUuid)
  const k = (entry?.kind ?? kind ?? 'cut') as DealEntryKind
  return <EntryFormInner token={token} deal={state.data} kind={k} entryUuid={entry?.uuid} />
}

type LineDraft = { grade: string; kg: string; price: number }

function EntryFormInner({ token, deal, kind, entryUuid }: { token: string; deal: Deal; kind: DealEntryKind; entryUuid?: string }) {
  const entry = deal.entries?.find((e) => e.uuid === entryUuid)
  const previous = [...(deal.entries ?? [])].filter((e) => e.kind === 'cut').sort((a, b) => a.date.localeCompare(b.date)).at(-1)
  const [date, setDate] = useState(entry?.date ?? today())
  const [amount, setAmount] = useState(entry?.amount ?? (kind === 'deposit' ? 0 : 0))
  const [note, setNote] = useState(entry?.note ?? '')
  const [lines, setLines] = useState<LineDraft[]>(
    entry?.lines?.map((l) => ({ grade: l.grade, kg: qtyText(l.kg), price: l.price })) ??
      previous?.lines?.map((l) => ({ grade: l.grade, kg: '', price: l.price })) ?? [{ grade: 'Loại A', kg: '', price: 0 }],
  )
  const [deduct, setDeduct] = useState(entry?.deposit_deduct ?? 0)
  const [paid, setPaid] = useState<number | null>(entry ? entry.paid : null)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const parsed: CutLine[] = lines.map((l) => ({ grade: l.grade, kg: parseQty(l.kg), price: l.price })).filter((l) => l.kg > 0)
  const value = cutValue(parsed)
  const depositLeft = deal.summary.with_pending.deposit_left + (entry?.deposit_deduct ?? 0)
  const paidNow = paid ?? Math.max(0, value - deduct)
  const setLine = (i: number, patch: Partial<LineDraft>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const back = `don/${deal.uuid}`

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSending(true)
    setError(null)
    const input: DealEntryInput =
      kind === 'cut'
        ? { date, lines: parsed, deposit_deduct: deduct, paid: paidNow, note: note || null }
        : { date, amount, note: note || null }
    try {
      if (entry) await api.updateDealEntry(token, entry.uuid, input)
      else await api.addDealEntry(token, deal.uuid, { ...input, kind })
      showToast({ message: kind === 'cost' ? 'Đã lưu chi phí (chỉ mình thấy)' : 'Đã lưu, chờ bên kia xác nhận' })
      go(back)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSending(false)
    }
  }

  return (
    <form className="form ledger" onSubmit={submit}>
      <a className="back" href={href(back)}>
        ‹ {deal.title}
      </a>
      <h1>{entry ? `Sửa: ${TITLES[kind].slice(3)}` : TITLES[kind]}</h1>
      {entry?.status === 'confirmed' && <div className="notice">Mục này bên kia đã xác nhận. Sửa xong sẽ cần bên kia xác nhận lại.</div>}
      {kind === 'cost' && <p className="small muted">Chi phí riêng (xe, công cắt, bốc vác…) chỉ mình thấy, dùng để tính lời cả lô. Bên kia không thấy.</p>}
      <label>
        Ngày
        <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} />
      </label>

      {kind === 'cut' ? (
        <>
          <fieldset>
            <legend>Hàng cân đợt này</legend>
            <datalist id="deal-grades">
              {CUT_GRADES.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
            {lines.map((l, i) => (
              <div key={i} className="cut-line">
                <input aria-label="Loại hàng" value={l.grade} onChange={(e) => setLine(i, { grade: e.target.value })} list="deal-grades" maxLength={40} />
                <span className="with-suffix">
                  <input aria-label={`Số kg ${l.grade}`} inputMode="decimal" value={l.kg} onChange={(e) => setLine(i, { kg: e.target.value.replace(/[^\d.,]/g, '') })} placeholder="0" />
                  <span className="muted">{deal.unit}</span>
                </span>
                <span className="with-suffix">
                  <input
                    aria-label={`Giá ${l.grade}`}
                    inputMode="numeric"
                    value={l.price ? l.price.toLocaleString('vi-VN') : ''}
                    onChange={(e) => setLine(i, { price: Number(e.target.value.replace(/\D/g, '')) || 0 })}
                    placeholder="Giá"
                  />
                  <span className="muted">đ/{deal.unit}</span>
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
            <p className="small muted">
              Tiền hàng đợt này ({formatQty(parsed.reduce((s, l) => s + l.kg, 0))} {deal.unit})
            </p>
            <p className="big in">{formatVnd(value)}</p>
          </section>
          {depositLeft > 0 && (
            <>
              <MoneyField label={`Trừ cọc (cọc còn ${formatVnd(depositLeft)})`} value={deduct} onChange={(v) => setDeduct(Math.min(v, depositLeft, value))} />
              <div className="actions">
                <button type="button" onClick={() => setDeduct(Math.min(depositLeft, value))}>
                  Trừ {formatVnd(Math.min(depositLeft, value))}
                </button>
                <button type="button" onClick={() => setDeduct(0)}>
                  Không trừ
                </button>
              </div>
            </>
          )}
          <MoneyField label="Tiền trả ngay lúc cân" value={paidNow} onChange={(v) => setPaid(Math.min(v, Math.max(0, value - deduct)))} />
          <div className="actions">
            <button type="button" onClick={() => setPaid(Math.max(0, value - deduct))}>
              Trả đủ {formatVnd(Math.max(0, value - deduct))}
            </button>
            <button type="button" onClick={() => setPaid(0)}>
              Chưa trả
            </button>
          </div>
          {value - deduct - paidNow > 0 && <p className="small out">Còn nợ lại đợt này: {formatVnd(value - deduct - paidNow)}</p>}
        </>
      ) : (
        <MoneyField label="Số tiền" value={amount} onChange={setAmount} required />
      )}

      <label>
        Ghi chú
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={255} placeholder={kind === 'cost' ? 'Ví dụ: tiền xe tải' : ''} />
      </label>
      {error && <div className="notice error">{error}</div>}
      <button type="submit" className="wide primary" disabled={sending || (kind === 'cut' ? value <= 0 : amount <= 0)}>
        {sending ? 'Đang lưu…' : kind === 'cost' ? 'Lưu' : 'Lưu và gửi bên kia xác nhận'}
      </button>
    </form>
  )
}
