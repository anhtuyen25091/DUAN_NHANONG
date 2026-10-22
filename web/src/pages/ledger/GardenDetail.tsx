import {
  allocatedEntries,
  filterEntries,
  formatDate,
  formatQty,
  formatVnd,
  monthlyTotals,
  seasonRange,
  seasonsOf,
  supplyUsedValue,
  contractSummaries,
  CONTRACT_STATUS_LABELS,
  costPerUnit,
  formatHarvest,
  formatQtyGrouped,
  harvestTotals,
  paginate,
  today,
  totals,
  type Ledger,
  type LedgerSnapshot,
} from '@nhanong/shared'
import { go, href, replaceQuery } from '../../hooks'
import { MonthBars } from '../../components/MonthBars'
import { showToast } from '../../ledger/toast'
import { EntryList } from './EntryList'
import { FarmLogSection, WithholdingNotice } from './FarmLogs'
import { Pager } from '../../components/Pager'

const PER_PAGE = 20
import { FieldLines } from './extraFields'
import { ProfitCard } from './LedgerHome'

/**
 * Một vườn (id = "chung": các khoản chi chung).
 * Chế độ Nâng cao: chọn xem theo vụ (?vu=id), danh sách vụ, vật tư đã dùng.
 */
export function GardenDetail({ ledger, data, id, query }: { ledger: Ledger; data: LedgerSnapshot; id: string; query: URLSearchParams }) {
  const garden = data.gardens.find((g) => g.id === id)
  const gardenId = id === 'chung' ? null : id

  if (gardenId && !garden)
    return (
      <div className="notice">
        Không tìm thấy vườn này. <a href={href('so')}>Về sổ thu chi</a>
      </div>
    )

  const advanced = !!data.meta.advanced
  const year = today().slice(0, 4)
  const seasons = gardenId ? seasonsOf(data.seasons, gardenId) : []
  // Mặc định xem vụ đang làm (nếu có), không thì năm nay
  const view = query.get('vu') ?? (advanced && seasons.find((s) => !s.ended_on)?.id) ?? 'nam'
  const season = seasons.find((s) => s.id === view)
  const range: { from?: string; to?: string } = season ? seasonRange(season) : view === 'tat-ca' ? {} : { from: `${year}-01-01` }
  const label = season ? `${season.name} (${formatDate(season.started_on)} – ${season.ended_on ? formatDate(season.ended_on) : 'nay'})` : view === 'tat-ca' ? 'Từ trước tới nay' : `Năm ${year}`

  // Lời/lỗ tính cả vật tư lấy từ kho; danh sách chỉ hiện khoản ghi thật
  const allocated = filterEntries(allocatedEntries(data), { gardenId })
  // Chế độ Cơ bản: danh sách hiện mọi khoản như trước; Nâng cao: theo vụ / năm đang chọn
  const listRange: { from?: string; to?: string } = advanced && garden ? range : {}
  const entries = filterEntries(data.transactions, { gardenId, ...listRange })
  const entryPage = paginate(entries, Number(query.get('trang')), PER_PAGE)
  const usages = data.supply_usages.filter(
    (u) => u.garden_id === gardenId && (!listRange.from || u.used_on >= listRange.from) && (!listRange.to || u.used_on <= listRange.to),
  )
  const supplies = new Map(data.supplies.map((s) => [s.id, s]))

  const remove = async () => {
    if (!garden) return
    try {
      const undo = await ledger.removeGarden(garden.id)
      showToast({ message: `Đã xóa ${garden.name}. Các khoản của vườn chuyển sang chi chung.`, undo })
      go('so')
    } catch (err) {
      showToast({ message: (err as Error).message })
    }
  }
  const contracts = gardenId ? contractSummaries(data).filter((c) => c.contract.garden_id === gardenId) : []

  const endSeason = async () => {
    if (!season) return
    try {
      await ledger.updateSeason(season.id, { ended_on: today() })
      showToast({ message: `Đã kết thúc ${season.name}` })
    } catch (err) {
      showToast({ message: (err as Error).message })
    }
  }

  return (
    <div className="ledger">
      <a className="back" href={href('so')}>
        ‹ Sổ thu chi
      </a>
      <div className="title-row">
        <h1>{garden ? `🌳 ${garden.name}` : '📦 Chi chung'}</h1>
        {garden && (
          <a className="button subtle" href={href(`so/vuon/${garden.id}/sua`)}>
            Sửa
          </a>
        )}
      </div>
      {garden && (garden.crop || garden.area_m2) && (
        <p className="muted">{[garden.crop, garden.area_m2 ? `${garden.area_m2.toLocaleString('vi-VN')} m²` : null].filter(Boolean).join(' · ')}</p>
      )}
      {garden && <FieldLines fields={data.custom_fields} target="garden" extra={garden.extra} />}
      {garden && <WithholdingNotice data={data} gardenId={garden.id} />}

      {advanced && garden ? (
        <>
          <nav className="segmented wrap" aria-label="Xem theo">
            {seasons.map((s) => (
              <button key={s.id} type="button" className={s.id === view ? 'active' : ''} aria-pressed={s.id === view} onClick={() => replaceQuery(`so/vuon/${id}`, { vu: s.id })}>
                {s.ended_on ? '' : '🌱 '}
                {s.name}
              </button>
            ))}
            <button type="button" className={view === 'nam' ? 'active' : ''} aria-pressed={view === 'nam'} onClick={() => replaceQuery(`so/vuon/${id}`, { vu: 'nam' })}>
              Năm {year}
            </button>
            <button type="button" className={view === 'tat-ca' ? 'active' : ''} aria-pressed={view === 'tat-ca'} onClick={() => replaceQuery(`so/vuon/${id}`, { vu: 'tat-ca' })}>
              Tất cả
            </button>
          </nav>
          <ProfitCard label={label} {...totals(filterEntries(allocated, range))} />
          <div className="actions">
            <a className="button" href={href(`so/vuon/${id}/vu-moi`)}>
              ＋ Thêm vụ
            </a>
            {season && (
              <a className="button subtle" href={href(`so/vuon/${id}/vu/${season.id}`)}>
                Sửa vụ
              </a>
            )}
            {season && !season.ended_on && (
              <button type="button" onClick={endSeason}>
                Kết thúc vụ hôm nay
              </button>
            )}
          </div>
          {seasons.length === 0 && <p className="small muted">Chia theo vụ để biết mỗi vụ lời hay lỗ (ví dụ vụ cà phê từ tháng 5 năm nay đến tháng 4 năm sau).</p>}
          {gardenId && supplyUsedValue(data, gardenId, range) > 0 && (
            <p className="small muted">Trong đó vật tư lấy từ kho: {formatVnd(supplyUsedValue(data, gardenId, range))}</p>
          )}
        </>
      ) : (
        <>
          <ProfitCard label={`Năm ${year}`} {...totals(filterEntries(allocated, { from: `${year}-01-01` }))} />
          <ProfitCard label="Từ trước tới nay" {...totals(allocated)} />
        </>
      )}

      <section className="card">
        <h2>6 tháng gần đây</h2>
        <MonthBars months={monthlyTotals(allocated, 6, today())} />
      </section>

      {garden && <FarmLogSection data={data} gardenId={garden.id} />}

      {advanced && garden && (
        <>
          <h2 className="section">🤝 Bán cho lái</h2>
          {contracts.map(({ contract, cuts, delivered, depositLeft }) => (
            <a key={contract.id} className="card garden-row" href={href(`so/ban/${contract.id}`)}>
              <span className="garden-name">
                {contract.buyer}
                <span className="small muted">
                  {' '}
                  · {cuts.length} đợt · {CONTRACT_STATUS_LABELS[contract.status]}
                  {contract.status === 'open' && depositLeft > 0 && ` · cọc còn ${formatVnd(depositLeft)}`}
                </span>
              </span>
              <span className="profit gain">{formatVnd(delivered)}</span>
            </a>
          ))}
          <a className="button" href={href('so/ban/moi', { vuon: garden.id })}>
            ＋ Nhận cọc của lái
          </a>

          <HarvestSection data={data} gardenId={garden.id} range={range} label={label} expense={totals(filterEntries(allocated, range)).expense} />
        </>
      )}

      {usages.length > 0 && (
        <>
          <h2 className="section">Vật tư đã dùng</h2>
          <div className="entries">
            {usages.map((u) => {
              const s = supplies.get(u.supply_id)
              return (
                <a key={u.id} className="entry entry-main" href={href(`so/kho/${u.supply_id}`)}>
                  <span className="entry-icon" aria-hidden>
                    📦
                  </span>
                  <span className="entry-text">
                    <span>{s?.name ?? 'Vật tư'}</span>
                    <span className="small muted">
                      {formatDate(u.used_on)} · {formatQty(u.quantity)} {s?.unit}
                    </span>
                  </span>
                  <span className="amount out">-{formatVnd(Math.round(u.quantity * (s?.unit_price ?? 0)))}</span>
                </a>
              )
            })}
          </div>
        </>
      )}

      <h2 className="section" id="cac-khoan">
        Các khoản đã ghi {entries.length > PER_PAGE && <span className="small muted">({entries.length})</span>}
      </h2>
      <EntryList ledger={ledger} data={data} entries={entryPage.items} />
      <Pager
        page={entryPage.page}
        pages={entryPage.pages}
        onPage={(p) => {
          replaceQuery(`so/vuon/${id}`, { vu: query.get('vu'), trang: String(p) })
          document.getElementById('cac-khoan')?.scrollIntoView()
        }}
      />

      {garden && (
        <button type="button" className="wide danger-outline" onClick={remove}>
          Xóa vườn này
        </button>
      )}

      <a className="fab" href={href('so/ghi', { vuon: gardenId ?? undefined, ve: `so/vuon/${id}` })}>
        ＋ Ghi tiền
      </a>
    </div>
  )
}

/** Sản lượng thu hoạch của vườn trong vụ / năm đang xem, kèm giá thành mỗi kg */
function HarvestSection({ data, gardenId, range, label, expense }: { data: LedgerSnapshot; gardenId: string; range: { from?: string; to?: string }; label: string; expense: number }) {
  const sum = harvestTotals(data, gardenId, range)
  const perKg = costPerUnit(expense, sum.kg)
  const list = data.harvests.filter((h) => h.garden_id === gardenId && (!range.from || h.date >= range.from) && (!range.to || h.date <= range.to))
  return (
    <>
      <h2 className="section">🌾 Thu hoạch</h2>
      {sum.byUnit.length > 0 ? (
        <section className="card">
          <p className="small muted">Sản lượng · {label}</p>
          <p className="big">{sum.byUnit.map((u) => `${formatQtyGrouped(u.quantity)} ${u.unit}`).join(' · ')}</p>
          {sum.cutKg > 0 && <p className="small muted">Gồm {formatQtyGrouped(sum.cutKg)} kg đã cắt bán cho lái (tự cộng, không cần ghi lại).</p>}
          {perKg !== null && (
            <p>
              Giá thành: <b>{formatVnd(perKg)}/kg</b> <span className="small muted">(tiền chi {formatVnd(expense)} ÷ {formatQtyGrouped(sum.kg)} kg)</span>
            </p>
          )}
        </section>
      ) : (
        <p className="small muted">Ghi sản lượng mỗi lần hái / cắt để biết mỗi kg tốn bao nhiêu tiền (giá thành), so với giá bán.</p>
      )}
      {list.length > 0 && (
        <div className="entries">
          {list.map((h) => (
            <a key={h.id} className="entry entry-main" href={href(`so/thu-hoach/${h.id}`)}>
              <span className="entry-icon" aria-hidden>
                🌾
              </span>
              <span className="entry-text">
                <span>{formatHarvest(h)}</span>
                <span className="small muted">
                  {formatDate(h.date)}
                  {h.note ? ` · ${h.note}` : ''}
                </span>
              </span>
              <span className={`amount ${h.price ? 'in' : 'muted'}`}>{h.price ? `+${formatVnd(Math.round(h.quantity * h.price))}` : 'chưa bán'}</span>
            </a>
          ))}
        </div>
      )}
      <a className="button" href={href(`so/vuon/${gardenId}/thu-hoach-moi`)}>
        ＋ Ghi thu hoạch
      </a>
    </>
  )
}
