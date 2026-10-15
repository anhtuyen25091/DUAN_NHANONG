import { formatDate, formatQty, formatVnd, supplyCost, supplyStock, today, type Ledger, type LedgerSnapshot } from '@nhanong/shared'
import { useState, type FormEvent } from 'react'
import { go, href } from '../../hooks'
import { showToast } from '../../ledger/toast'
import { parseQty, qtyText } from '../../ledger/qty'
import { CategoryPicker, GardenPicker, MoneyField, QtyField } from './fields'

const UNITS = ['bao', 'chai', 'gói', 'kg', 'lít', 'cây', 'thùng']

/** #/so/kho: vật tư trong kho, còn bao nhiêu */
export function SupplyList({ data }: { data: LedgerSnapshot }) {
  const stock = supplyStock(data)
  const inStock = stock.filter((s) => s.left > 1e-9)
  const used = stock.filter((s) => s.left <= 1e-9)
  const value = inStock.reduce((sum, s) => sum + s.leftValue, 0)

  const row = ({ supply, left, leftValue }: (typeof stock)[number]) => (
    <a key={supply.id} className="card garden-row" href={href(`so/kho/${supply.id}`)}>
      <span className="garden-name">
        {data.categories.find((c) => c.id === supply.category_id)?.icon ?? '📦'} {supply.name}
        <span className="small muted">
          {' '}
          · còn {formatQty(left)}/{formatQty(supply.quantity)} {supply.unit}
        </span>
      </span>
      <span className="profit">{left > 1e-9 ? formatVnd(leftValue) : 'Hết'}</span>
    </a>
  )

  return (
    <div className="ledger">
      <a className="back" href={href('so')}>
        ‹ Sổ thu chi
      </a>
      <h1>📦 Kho vật tư</h1>
      <p className="small muted">Mua phân, thuốc về để dành: ghi vào kho. Khi đem bón/xịt cho vườn nào thì bấm vào vật tư → "Dùng cho vườn", tiền sẽ tính vào vườn đó.</p>

      <section className="card">
        <p className="small muted">Giá trị vật tư còn trong kho</p>
        <p className="big">{formatVnd(value)}</p>
      </section>

      {stock.length === 0 && <div className="notice">Kho chưa có gì. Bấm “＋ Mua vật tư” để ghi lần mua đầu tiên.</div>}
      <div className="garden-list">{inStock.map(row)}</div>
      {used.length > 0 && (
        <>
          <h2 className="section">Đã dùng hết</h2>
          <div className="garden-list faded">{used.map(row)}</div>
        </>
      )}

      <a className="fab" href={href('so/kho/mua')}>
        ＋ Mua vật tư
      </a>
    </div>
  )
}

/** #/so/kho/mua, #/so/kho/:id/sua */
export function SupplyForm({ ledger, data, id }: { ledger: Ledger; data: LedgerSnapshot; id?: string }) {
  const supply = data.supplies.find((s) => s.id === id)
  const defaultCategory = data.categories.find((c) => c.name === 'Phân bón')?.id ?? data.categories.find((c) => c.type === 'expense')!.id
  const [name, setName] = useState(supply?.name ?? '')
  const [categoryId, setCategoryId] = useState(supply?.category_id ?? defaultCategory)
  const [qty, setQty] = useState(qtyText(supply?.quantity ?? 0))
  const [unit, setUnit] = useState(supply?.unit ?? 'bao')
  const [unitPrice, setUnitPrice] = useState(supply?.unit_price ?? 0)
  const [boughtOn, setBoughtOn] = useState(supply?.bought_on ?? today())
  const [shop, setShop] = useState(supply?.shop_name ?? '')
  const [note, setNote] = useState(supply?.note ?? '')
  const [onCredit, setOnCredit] = useState(false)
  const [useFor, setUseFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const quantity = parseQty(qty)
  const total = supplyCost({ quantity, unit_price: unitPrice })
  const valid = name.trim() !== '' && quantity > 0 && unitPrice > 0

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    setError(null)
    const input = { name, category_id: categoryId, unit, quantity, unit_price: unitPrice, bought_on: boughtOn, shop_name: shop, note }
    try {
      if (supply) {
        await ledger.updateSupply(supply.id, input)
        go(`so/kho/${supply.id}`)
      } else {
        const created = await ledger.addSupply({ ...input, on_credit: onCredit, use_for: useFor })
        showToast({ message: `Đã ghi mua ${name.trim()}: ${formatVnd(total)}${onCredit ? ' (mua thiếu, đã ghi công nợ)' : ''}` })
        go(`so/kho/${created.id}`)
      }
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <form className="form ledger" onSubmit={submit}>
      <a className="back" href={href(supply ? `so/kho/${supply.id}` : 'so/kho')}>
        ‹ Quay lại
      </a>
      <h1>{supply ? 'Sửa vật tư' : 'Mua vật tư'}</h1>
      <label>
        Tên vật tư *
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} placeholder="Ví dụ: NPK 16-16-8, Thuốc rầy Actara" autoFocus={!supply} />
      </label>
      <CategoryPicker data={data} type="expense" value={categoryId} onChange={setCategoryId} />
      <div className="row-2">
        <QtyField label="Số lượng *" text={qty} onText={setQty} />
        <label>
          Đơn vị
          <input value={unit} onChange={(e) => setUnit(e.target.value)} list="supply-units" maxLength={20} />
          <datalist id="supply-units">
            {UNITS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </label>
      </div>
      <MoneyField label={`Giá 1 ${unit || 'đơn vị'} *`} value={Math.round(unitPrice)} onChange={setUnitPrice} />
      <MoneyField label="Thành tiền (gõ vào đây nếu chỉ nhớ tổng tiền)" value={total} onChange={(t) => setUnitPrice(quantity > 0 ? t / quantity : 0)} />
      <label>
        Ngày mua
        <input type="date" value={boughtOn} max={today()} onChange={(e) => setBoughtOn(e.target.value || today())} />
      </label>
      <label>
        Mua ở đâu
        <input value={shop} onChange={(e) => setShop(e.target.value)} maxLength={80} placeholder="Ví dụ: Đại lý Hai Lúa" />
      </label>
      <label>
        Ghi chú
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
      </label>

      {!supply && (
        <>
          <label className="checkbox">
            <input type="checkbox" checked={onCredit} onChange={(e) => setOnCredit(e.target.checked)} />
            Mua thiếu, chưa trả tiền (ghi vào công nợ)
          </label>
          {data.gardens.length > 0 && (
            <fieldset>
              <legend>Dùng hết ngay cho vườn?</legend>
              <div className="segmented wrap">
                <button type="button" className={useFor === null ? 'active' : ''} aria-pressed={useFor === null} onClick={() => setUseFor(null)}>
                  Để trong kho
                </button>
                {data.gardens.map((g) => (
                  <button key={g.id} type="button" className={g.id === useFor ? 'active' : ''} aria-pressed={g.id === useFor} onClick={() => setUseFor(g.id)}>
                    {g.name}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
        </>
      )}

      {error && <div className="notice error">{error}</div>}
      <button type="submit" className="wide primary" disabled={!valid}>
        {supply ? 'Lưu' : `Lưu · tiền ra ${formatVnd(total)}`}
      </button>
    </form>
  )
}

/** #/so/kho/:id: thông tin, còn bao nhiêu, dùng cho vườn nào */
export function SupplyDetail({ ledger, data, id }: { ledger: Ledger; data: LedgerSnapshot; id: string }) {
  const stock = supplyStock(data).find((s) => s.supply.id === id)
  const [gardenId, setGardenId] = useState<string | null>(data.gardens.some((g) => g.id === data.meta.last_garden_id) ? data.meta.last_garden_id! : (data.gardens[0]?.id ?? null))
  const [qty, setQty] = useState(qtyText(stock?.left ?? 0))
  const [usedOn, setUsedOn] = useState(today())
  const [error, setError] = useState<string | null>(null)

  if (!stock)
    return (
      <div className="notice">
        Không tìm thấy vật tư này. <a href={href('so/kho')}>Về kho</a>
      </div>
    )
  const { supply, used, left } = stock
  const usages = data.supply_usages.filter((u) => u.supply_id === id)
  const gardens = new Map(data.gardens.map((g) => [g.id, g.name]))
  const debt = data.debts.find((d) => d.supply_id === id)

  const use = async (e: FormEvent) => {
    e.preventDefault()
    if (!gardenId) return
    setError(null)
    try {
      const quantity = parseQty(qty)
      await ledger.useSupply({ supply_id: id, garden_id: gardenId, quantity, used_on: usedOn })
      showToast({ message: `Đã ghi dùng ${formatQty(quantity)} ${supply.unit} cho ${gardens.get(gardenId)}` })
      setQty(qtyText(Math.max(0, left - quantity)))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const remove = async () => {
    if (!window.confirm(`Xóa ${supply.name}? Khoản tiền ra lúc mua${debt ? ', khoản nợ mua thiếu' : ''} và các lần dùng cũng bị xóa.`)) return
    const undo = await ledger.removeSupply(id)
    showToast({ message: `Đã xóa ${supply.name}`, undo })
    go('so/kho')
  }

  return (
    <div className="ledger">
      <a className="back" href={href('so/kho')}>
        ‹ Kho vật tư
      </a>
      <div className="title-row">
        <h1>
          {data.categories.find((c) => c.id === supply.category_id)?.icon ?? '📦'} {supply.name}
        </h1>
        <a className="button subtle" href={href(`so/kho/${id}/sua`)}>
          Sửa
        </a>
      </div>
      <p className="muted">
        Mua {formatDate(supply.bought_on)}
        {supply.shop_name && ` ở ${supply.shop_name}`} · {formatQty(supply.quantity)} {supply.unit} × {formatVnd(supply.unit_price)} = <b>{formatVnd(supplyCost(supply))}</b>
      </p>
      {debt && (
        <p>
          <a href={href(`so/no/${debt.id}`)}>🧾 Mua thiếu: xem công nợ</a>
        </p>
      )}

      <section className="card">
        <p className="big">
          Còn {formatQty(left)} {supply.unit}
        </p>
        <div className="stock-bar" role="img" aria-label={`Đã dùng ${formatQty(used)} trên ${formatQty(supply.quantity)} ${supply.unit}`}>
          <span style={{ width: `${Math.min(100, (used / supply.quantity) * 100)}%` }} />
        </div>
        <p className="small muted">
          Đã dùng {formatQty(used)} {supply.unit}
        </p>
      </section>

      {left > 1e-9 && data.gardens.length > 0 && (
        <form className="form card" onSubmit={use}>
          <h2>Dùng cho vườn</h2>
          <GardenPicker data={data} value={gardenId} onChange={setGardenId} />
          <QtyField label="Số lượng" text={qty} onText={setQty} suffix={supply.unit} />
          <label>
            Ngày dùng
            <input type="date" value={usedOn} max={today()} onChange={(e) => setUsedOn(e.target.value || today())} />
          </label>
          {error && <div className="notice error">{error}</div>}
          <button type="submit" className="wide primary" disabled={!gardenId || !(parseQty(qty) > 0)}>
            Ghi đã dùng · {formatVnd(Math.round(parseQty(qty) * supply.unit_price))}
          </button>
        </form>
      )}
      {left > 1e-9 && data.gardens.length === 0 && (
        <div className="notice">
          Thêm vườn trước để ghi vật tư dùng cho vườn nào. <a href={href('so/vuon-moi')}>＋ Thêm vườn</a>
        </div>
      )}

      <h2 className="section">Các lần dùng</h2>
      {usages.length === 0 && <p className="muted">Chưa dùng lần nào.</p>}
      <div className="entries">
        {usages.map((u) => (
          <div key={u.id} className="entry">
            <span className="entry-main">
              <span className="entry-icon" aria-hidden>
                🌳
              </span>
              <span className="entry-text">
                <span>{gardens.get(u.garden_id) ?? 'Vườn đã xóa'}</span>
                <span className="small muted">
                  {formatDate(u.used_on)} · {formatQty(u.quantity)} {supply.unit}
                </span>
              </span>
              <span className="amount out">-{formatVnd(Math.round(u.quantity * supply.unit_price))}</span>
            </span>
            <button
              type="button"
              className="entry-del"
              aria-label="Xóa lần dùng này"
              onClick={async () => {
                const undo = await ledger.removeUsage(u.id)
                showToast({ message: `Đã trả ${formatQty(u.quantity)} ${supply.unit} về kho`, undo })
              }}
            >
              🗑
            </button>
          </div>
        ))}
      </div>

      <button type="button" className="wide danger-outline" onClick={remove}>
        Xóa vật tư này
      </button>
    </div>
  )
}
