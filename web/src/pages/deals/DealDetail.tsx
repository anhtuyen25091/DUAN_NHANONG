import { ApiError, formatDate, formatQty, formatVnd, telHref, type Deal, type DealEntry } from '@nhanong/shared'
import { useEffect, useState } from 'react'
import { api } from '../../api'
import { dealWatcher } from '../../dealWatch'
import { PrintButtons } from '../../components/PrintButtons'
import { Status } from '../../components/Status'
import { go, href, useAsync } from '../../hooks'
import { useLedger } from '../../ledger/useLedger'
import { showToast } from '../../ledger/toast'
import { balanceText, counterpartName } from './dealText'

const KIND_LABEL: Record<DealEntry['kind'], string> = { deposit: '💰 Cọc', cut: '✂️ Đợt cân', payment: '💵 Trả tiền', cost: '🧾 Chi phí riêng' }
const STATUS_LABEL: Record<DealEntry['status'], string> = { pending: '⏳ Chờ xác nhận', confirmed: '✅ Đã xác nhận', disputed: '⚠️ Báo sai', private: '🔒 Chỉ mình thấy' }

/** #/don/:uuid: 2 bên cùng xem; mục bên kia ghi thì Đồng ý / Báo sai */
export function DealDetail({ token, uuid }: { token: string; uuid: string }) {
  const [state, retry] = useAsync(() => api.deal(token, uuid), [token, uuid])
  // Bản mới nhất sau khi mình bấm / tải lại; chưa có thì dùng bản tải lần đầu
  const [latest, setDeal] = useState<Deal | null>(null)
  const deal = latest ?? (state.status === 'ok' ? state.data : null)
  // Bên kia vừa ghi / xác nhận: tải lại ngay khi bộ theo dõi báo đơn này đổi; dự phòng 15 giây 1 lần
  useEffect(() => {
    const reload = () => api.deal(token, uuid).then(setDeal, () => {})
    const off = dealWatcher.onDealChanged((changed) => changed === uuid && void reload())
    const timer = setInterval(reload, 15_000)
    return () => {
      off()
      clearInterval(timer)
    }
  }, [token, uuid])

  if (!deal) return <Status state={state} retry={retry} />

  const run = async (action: () => Promise<Deal>, message?: string) => {
    try {
      setDeal(await action())
      if (message) showToast({ message })
    } catch (err) {
      showToast({ message: (err as Error).message })
    }
  }
  const open = deal.status === 'open'
  const c = deal.summary.confirmed
  const p = deal.summary.with_pending
  const entries = [...(deal.entries ?? [])].sort((a, b) => b.date.localeCompare(a.date) || b.updated_at.localeCompare(a.updated_at))

  return (
    <div className="ledger">
      <a className="back" href={href('don')}>
        ‹ Đơn mua bán
      </a>
      <h1>
        {deal.my_role === 'buyer' ? '🛒' : '🌳'} {deal.title}
      </h1>
      <p className="muted">
        {deal.my_role === 'buyer' ? 'Mình là bên mua · mua của ' : 'Mình là bên bán · bán cho '}
        <b>{counterpartName(deal)}</b>
        {deal.status !== 'open' && ` · ${deal.status === 'done' ? 'Đã xong' : 'Đã hủy'}`}
      </p>
      {deal.counterpart?.phone && (
        <p>
          <a className="button" href={telHref(deal.counterpart.phone)}>
            📞 Gọi {deal.counterpart.phone}
          </a>
        </p>
      )}

      {!deal.joined && <ShareCode deal={deal} />}

      <section className={`card profit-card ${c.balance > 0 && deal.my_role === 'buyer' ? 'loss' : 'gain'}`}>
        <p className="small muted">Đã 2 bên xác nhận</p>
        <p className="big">{balanceText(deal, c)}</p>
        <dl className="deal-totals">
          <div>
            <dt>Tiền hàng ({formatQty(c.kg)} {deal.unit})</dt>
            <dd>{formatVnd(c.delivered)}</dd>
          </div>
          <div>
            <dt>Tiền cọc</dt>
            <dd>{formatVnd(c.deposit)}</dd>
          </div>
          <div>
            <dt>Đã trừ cọc · cọc còn</dt>
            <dd>
              {formatVnd(c.deducted)} · {formatVnd(c.deposit_left)}
            </dd>
          </div>
          <div>
            <dt>Đã trả tiền</dt>
            <dd>{formatVnd(c.paid)}</dd>
          </div>
        </dl>
        {(deal.summary.awaiting_me > 0 || deal.summary.awaiting_other > 0) && p.balance !== c.balance && (
          <p className="small muted">Nếu đồng ý các mục đang chờ: {balanceText(deal, p).toLowerCase()}</p>
        )}
      </section>

      {deal.summary.awaiting_me > 0 && <div className="notice upgrade">🔔 Có {deal.summary.awaiting_me} mục bên kia vừa ghi, chờ bạn xác nhận (ở dưới).</div>}

      {open && (
        <div className="btn-row deal-add">
          {(['cut', 'deposit', 'payment', 'cost'] as const).map((kind) => (
            <a key={kind} className={`button${kind === 'cut' ? ' primary' : ''}`} href={href(`don/${deal.uuid}/muc-moi`, { loai: kind })}>
              ＋ {KIND_LABEL[kind]}
            </a>
          ))}
        </div>
      )}

      <h2 className="section">Các mục</h2>
      {entries.length === 0 && <p className="muted">Chưa có mục nào.</p>}
      <div className="deal-entries">
        {entries.map((e) => (
          <EntryCard key={e.uuid} deal={deal} entry={e} token={token} onDeal={setDeal} run={run} />
        ))}
      </div>

      {deal.my_role === 'seller' && <LotCard deal={deal} token={token} onDeal={setDeal} />}

      <LedgerLinkCard deal={deal} />

      <section className="card">
        <PrintButtons token={token} target={{ type: 'deal', id: deal.uuid }} label="Bảng quyết toán đơn (mọi đợt cân, cọc, tiền đã trả, còn lại) để gửi bên kia" />
      </section>

      <section className="card">
        <h2>Đơn</h2>
        <div className="btn-row">
          {open ? (
            <>
              <button type="button" onClick={() => run(() => api.updateDeal(token, deal.uuid, { status: 'done' }), `Đã kết thúc đơn, ${counterpartName(deal)} sẽ nhận thông báo`)}>
                Kết thúc đơn
              </button>
              <button type="button" className="danger-outline" onClick={() => window.confirm('Hủy đơn này?') && run(() => api.updateDeal(token, deal.uuid, { status: 'cancelled' }), 'Đã hủy đơn')}>
                Hủy đơn
              </button>
            </>
          ) : (
            <button type="button" onClick={() => run(() => api.updateDeal(token, deal.uuid, { status: 'open' }), 'Đã mở lại đơn')}>
              Mở lại đơn
            </button>
          )}
          {deal.is_creator && !deal.joined && (
            <button
              type="button"
              className="danger-outline"
              onClick={async () => {
                if (!window.confirm('Xóa hẳn đơn này?')) return
                await api.deleteDeal(token, deal.uuid)
                go('don')
              }}
            >
              Xóa đơn
            </button>
          )}
        </div>
        <p className="small muted">Mã đơn: {deal.code}</p>
      </section>
    </div>
  )
}

function ShareCode({ deal }: { deal: Deal }) {
  const link = `${window.location.origin}${window.location.pathname}#/don/tham-gia?ma=${deal.code}`
  const text = `Mời tham gia đơn "${deal.title}" trên app Nhà Nông. Mã: ${deal.code} · ${link}`
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Đơn mua bán Nhà Nông', text })
      else {
        await navigator.clipboard.writeText(text)
        showToast({ message: 'Đã chép lời mời, dán vào Zalo để gửi.' })
      }
    } catch {
      // Người dùng hủy chia sẻ
    }
  }
  return (
    <section className="card share-code">
      <p className="small muted">Gửi mã này cho {deal.my_role === 'buyer' ? 'bên bán' : 'bên mua'} để cùng xem và xác nhận đơn</p>
      <p className="code">{deal.code}</p>
      <button type="button" className="wide primary" onClick={share}>
        📤 Gửi mã (Zalo, tin nhắn…)
      </button>
    </section>
  )
}

function EntryCard({
  deal,
  entry: e,
  token,
  onDeal,
  run,
}: {
  deal: Deal
  entry: DealEntry
  token: string
  onDeal: (d: Deal) => void
  run: (action: () => Promise<Deal>, message?: string) => Promise<void>
}) {
  const open = deal.status === 'open'
  const canRespond = open && !e.mine && (e.status === 'pending' || e.status === 'disputed')
  const dispute = async () => {
    const reason = window.prompt('Sai chỗ nào? (ví dụ: Loại A là 1.250 kg)')
    if (!reason?.trim()) return
    try {
      onDeal(await api.disputeDealEntry(token, e.uuid, reason.trim()))
      showToast({ message: `Đã báo sai, ${counterpartName(deal)} sẽ nhận thông báo để sửa` })
    } catch (err) {
      showToast({ message: err instanceof ApiError ? err.message : (err as Error).message })
    }
  }

  return (
    <section className={`card deal-entry ${e.status}`}>
      <div className="deal-entry-head">
        <b>{KIND_LABEL[e.kind]}</b>
        <span className="small muted">
          {formatDate(e.date)} · {e.mine ? 'mình ghi' : `${e.created_by_name ?? 'bên kia'} ghi`}
        </span>
        <span className="tag">{STATUS_LABEL[e.status]}</span>
      </div>
      {e.kind === 'cut' && e.lines ? (
        <>
          <ul className="deal-lines">
            {e.lines.map((l, i) => (
              <li key={i}>
                {l.grade}: {formatQty(l.kg)} {deal.unit} × {formatVnd(l.price)} = <b>{formatVnd(Math.round(l.kg * l.price))}</b>
              </li>
            ))}
          </ul>
          <p>
            Tiền hàng <b>{formatVnd(e.amount)}</b>
            {e.deposit_deduct > 0 && ` · trừ cọc ${formatVnd(e.deposit_deduct)}`}
            {e.paid > 0 && ` · trả ngay ${formatVnd(e.paid)}`}
          </p>
        </>
      ) : (
        <p className="big-amount">{formatVnd(e.amount)}</p>
      )}
      {e.note && <p className="small muted">{e.note}</p>}
      {e.status === 'disputed' && e.dispute_reason && <p className="small out">⚠️ Lý do báo sai: {e.dispute_reason}</p>}
      {e.kind === 'cut' && e.status !== 'disputed' && (
        <details className="entry-print">
          <summary className="small">🖨 In phiếu cân đợt này</summary>
          <PrintButtons token={token} target={{ type: 'deal-entry', id: e.uuid }} label="" />
        </details>
      )}
      <div className="btn-row">
        {canRespond && (
          <>
            <button type="button" className="primary" onClick={() => run(() => api.confirmDealEntry(token, e.uuid), `Đã đồng ý, ${counterpartName(deal)} sẽ nhận thông báo`)}>
              ✓ Đồng ý
            </button>
            {e.status === 'pending' && (
              <button type="button" className="danger-outline" onClick={dispute}>
                Báo sai
              </button>
            )}
          </>
        )}
        {open && e.mine && (
          <a className="button" href={href(`don/${deal.uuid}/muc/${e.uuid}`)}>
            Sửa
          </a>
        )}
        {open && e.mine && e.status !== 'confirmed' && (
          <button type="button" className="danger-outline" onClick={() => window.confirm('Xóa mục này?') && run(() => api.deleteDealEntry(token, e.uuid), 'Đã xóa')}>
            Xóa
          </button>
        )}
      </div>
    </section>
  )
}

/** Thương lái: gộp các đơn mua (của nông dân) vào đơn bán này để tính lời cả lô */
function LotCard({ deal, token, onDeal }: { deal: Deal; token: string; onDeal: (d: Deal) => void }) {
  const [picking, setPicking] = useState(false)
  const [all] = useAsync(() => (picking ? api.deals(token) : Promise.resolve([])), [picking, token])
  const linked = new Set((deal.sources ?? []).map((s) => s.uuid))
  const buyDeals = all.status === 'ok' ? all.data.filter((d) => d.my_role === 'buyer') : []
  const lot = deal.lot

  const toggle = async (uuid: string) => {
    const next = linked.has(uuid) ? [...linked].filter((u) => u !== uuid) : [...linked, uuid]
    try {
      onDeal(await api.setDealSources(token, deal.uuid, next))
    } catch (err) {
      showToast({ message: (err as Error).message })
    }
  }

  return (
    <section className="card">
      <h2>📦 Lời cả lô (chỉ mình thấy)</h2>
      <p className="small muted">Thương lái mua của nhiều nông dân rồi bán lại: gộp các đơn mua vào đơn bán này để biết lời bao nhiêu.</p>
      {lot && lot.sources > 0 && (
        <dl className="deal-totals">
          <div>
            <dt>Tiền bán ({formatQty(lot.sell_kg)} kg)</dt>
            <dd className="in">{formatVnd(lot.revenue)}</dd>
          </div>
          <div>
            <dt>Tiền mua {lot.sources} đơn ({formatQty(lot.buy_kg)} kg)</dt>
            <dd className="out">−{formatVnd(lot.buy_cost)}</dd>
          </div>
          <div>
            <dt>Chi phí riêng (xe, công…)</dt>
            <dd className="out">−{formatVnd(lot.costs)}</dd>
          </div>
          <div>
            <dt>
              <b>{lot.profit >= 0 ? 'Lời' : 'Lỗ'}</b>
            </dt>
            <dd className={lot.profit >= 0 ? 'in' : 'out'}>
              <b>{formatVnd(Math.abs(lot.profit))}</b>
            </dd>
          </div>
          {lot.kg_loss !== 0 && (
            <div>
              <dt>Hao hụt</dt>
              <dd>{formatQty(lot.kg_loss)} kg</dd>
            </div>
          )}
        </dl>
      )}
      {(deal.sources ?? []).length > 0 && <p className="small">Đã gộp: {(deal.sources ?? []).map((s) => s.title).join(', ')}</p>}
      <button type="button" onClick={() => setPicking(!picking)}>
        {picking ? 'Xong' : '＋ Gộp đơn mua'}
      </button>
      {picking && (
        <div className="garden-list">
          {buyDeals.length === 0 && <p className="muted">Chưa có đơn nào mình là bên mua.</p>}
          {buyDeals.map((d) => (
            <label key={d.uuid} className="card garden-row checkbox-row">
              <span>
                <input type="checkbox" checked={linked.has(d.uuid)} onChange={() => toggle(d.uuid)} /> {d.title}
                <span className="small muted"> · {counterpartName(d)}</span>
              </span>
              <span>{formatVnd(d.summary.confirmed.delivered)}</span>
            </label>
          ))}
        </div>
      )}
    </section>
  )
}

/**
 * Ghi các đợt cân đã xác nhận vào Sổ thu chi của mình. Chọn vườn (hoặc chi chung) + hạng mục;
 * đã nối rồi thì đổi vườn / hạng mục là các khoản đã ghi chuyển theo ngay.
 */
function LedgerLinkCard({ deal }: { deal: Deal }) {
  const state = useLedger()
  const [draft, setDraft] = useState<{ garden_id: string | null; category_id: string | null } | null>(null)
  // Đơn thay đổi (bên kia vừa xác nhận…) thì cập nhật sổ ngay
  const linked = !!state.ledger?.getSnapshot().meta.deal_links?.[deal.uuid]
  useEffect(() => {
    if (linked && state.ledger) void state.ledger.applyDeal(deal)
  }, [deal, linked, state.ledger])
  if (!state.ledger) return null
  const { ledger, data } = state
  const link = data.meta.deal_links?.[deal.uuid]
  const seller = deal.my_role === 'seller'
  const type = seller ? 'income' : 'expense'
  const categories = data.categories.filter((c) => c.type === type)
  const defaultCategory = categories.find((c) => c.name === (seller ? 'Bán nông sản' : 'Mua nông sản'))?.id ?? null
  const gardenId = link ? link.garden_id : draft ? draft.garden_id : seller ? (data.gardens[0]?.id ?? null) : null
  const categoryId = link?.category_id ?? draft?.category_id ?? defaultCategory
  const gardenName = (id: string | null) => (id ? (data.gardens.find((g) => g.id === id)?.name ?? 'vườn đã xóa') : 'Chi chung')

  const save = async (next: { garden_id: string | null; category_id: string | null }, message?: (changed: number) => string) => {
    const category =
      next.category_id ??
      (seller ? await ledger.ensureCategory('income', 'Bán nông sản', '💰', '#15803d') : await ledger.ensureCategory('expense', 'Mua nông sản', '🧺', '#b45309'))
    await ledger.linkDeal(deal.uuid, { garden_id: next.garden_id, category_id: category })
    const changed = await ledger.applyDeal(deal)
    if (message) showToast({ message: message(changed) })
  }
  // Đã nối: đổi là lưu ngay; chưa nối: chỉ chọn, bấm "Nối với sổ" mới ghi
  const pick = (patch: Partial<{ garden_id: string | null; category_id: string | null }>) => {
    const next = { garden_id: gardenId, category_id: categoryId, ...patch }
    if (link) void save(next, (n) => `Đã chuyển sang ${gardenName(next.garden_id)}${n ? ` (${n} khoản)` : ''}`)
    else setDraft(next)
  }

  if (!data.meta.storage_mode)
    return (
      <section className="card">
        <h2>📒 Sổ thu chi</h2>
        <p className="small muted">Mở Sổ thu chi 1 lần để có thể tự ghi các đợt cân vào sổ.</p>
        <a className="button" href={href('so')}>
          Mở Sổ thu chi
        </a>
      </section>
    )

  return (
    <section className="card ledger-link">
      <h2>📒 Sổ thu chi</h2>
      <p className="small muted">
        {link
          ? `✅ Đã nối: các đợt cân đã xác nhận tự ghi ${seller ? 'tiền vào' : 'tiền ra'} vào ${gardenName(link.garden_id)}; chi phí riêng ghi tiền ra. Đổi vườn / hạng mục bên dưới, các khoản đã ghi chuyển theo.`
          : `Tự ghi các đợt cân đã xác nhận vào sổ (${seller ? 'tiền vào' : 'tiền ra'}). Cọc và tiền trả không tính vào lời/lỗ.`}
      </p>

      <p className="field-label">{seller ? 'Tiền bán hàng ghi cho vườn nào' : 'Tiền mua hàng ghi cho vườn nào'}</p>
      <div className="segmented wrap">
        {data.gardens.map((g) => (
          <button key={g.id} type="button" className={gardenId === g.id ? 'active' : ''} aria-pressed={gardenId === g.id} onClick={() => pick({ garden_id: g.id })}>
            🌳 {g.name}
          </button>
        ))}
        <button type="button" className={gardenId === null ? 'active' : ''} aria-pressed={gardenId === null} onClick={() => pick({ garden_id: null })}>
          📦 Chi chung
        </button>
        <a className="button subtle" href={href('so/vuon-moi', { ve: `don/${deal.uuid}` })}>
          ＋ Thêm vườn
        </a>
      </div>
      {seller && data.gardens.length === 0 && <p className="small out">Chưa có vườn nào: bấm "＋ Thêm vườn" để tạo vườn rồi chọn lại.</p>}

      {categories.length > 1 && (
        <>
          <p className="field-label">Hạng mục</p>
          <div className="segmented wrap">
            {categories.map((c) => (
              <button key={c.id} type="button" className={categoryId === c.id ? 'active' : ''} aria-pressed={categoryId === c.id} onClick={() => pick({ category_id: c.id })}>
                {c.icon} {c.name}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="btn-row">
        {link ? (
          <>
            <button type="button" onClick={async () => showToast({ message: `Đã cập nhật ${await ledger.applyDeal(deal)} khoản` })}>
              🔄 Cập nhật sổ
            </button>
            <button
              type="button"
              className="danger-outline"
              onClick={async () => {
                if (!window.confirm('Bỏ nối đơn với sổ? Các khoản tự ghi từ đơn sẽ bị gỡ khỏi sổ.')) return
                await ledger.linkDeal(deal.uuid, null)
                setDraft(null)
                showToast({ message: 'Đã bỏ nối, gỡ các khoản tự ghi' })
              }}
            >
              Bỏ nối
            </button>
          </>
        ) : (
          <button type="button" className="primary" onClick={() => save({ garden_id: gardenId, category_id: categoryId }, (n) => `Đã nối với sổ: ghi ${n} khoản vào ${gardenName(gardenId)}`)}>
            Nối với sổ
          </button>
        )}
      </div>
    </section>
  )
}
