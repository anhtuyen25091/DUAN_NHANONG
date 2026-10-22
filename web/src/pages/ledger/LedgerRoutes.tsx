import type { DebtKind } from '@nhanong/shared'
import { useEffect } from 'react'
import { refreshLinkedDeals } from '../../ledger/deals'
import { useLedger } from '../../ledger/useLedger'
import { AddEntry } from './AddEntry'
import { AllEntries } from './AllEntries'
import { ChooseMode } from './ChooseMode'
import { ContractDetail, ContractForm, ContractList, CutForm } from './Contracts'
import { DebtDetail, DebtForm, DebtList, PartyDebts } from './Debts'
import { CustomFieldSettings, HarvestForm, TemplateList, WorkDayForm, WorkerDetail, WorkerForm, WorkerList } from './Extras'
import { FarmLogBook, FarmLogForm } from './FarmLogs'
import { GardenDetail } from './GardenDetail'
import { GardenForm } from './GardenForm'
import { LedgerHome } from './LedgerHome'
import { LedgerSettings } from './LedgerSettings'
import { SeasonForm } from './SeasonForm'
import { SignIn } from './SignIn'
import { SupplyDetail, SupplyForm, SupplyList } from './Supplies'

/** Mọi trang dưới #/so/... (tải riêng, không làm nặng trang bảng giá) */
export default function LedgerRoutes({ path, query }: { path: string[]; query: URLSearchParams }) {
  const state = useLedger()
  // Ghi vào sổ các đợt cân mới xác nhận của đơn mua bán chung đã nối
  useEffect(() => {
    void refreshLinkedDeals()
  }, [])

  if (!state.ledger)
    return state.error ? (
      <div className="notice error">Trình duyệt không cho lưu dữ liệu (có thể đang ở chế độ ẩn danh). Hãy mở bằng cửa sổ thường.</div>
    ) : (
      <p className="muted center">Đang mở sổ…</p>
    )

  const { ledger, data } = state
  const [, page, id, action, sub] = path
  if (page === 'dang-nhap') return <SignIn data={data} />
  if (!data.meta.storage_mode) return <ChooseMode ledger={ledger} />

  return (
    <>
      {page === 'ghi' ? (
        <AddEntry key={query.get('sua') ?? 'new'} ledger={ledger} data={data} query={query} />
      ) : page === 'vuon-moi' ? (
        <GardenForm ledger={ledger} data={data} back={query.get('ve')} />
      ) : page === 'vuon' && id && action === 'sua' ? (
        <GardenForm ledger={ledger} data={data} id={id} />
      ) : page === 'vuon' && id && action === 'thu-hoach-moi' ? (
        <HarvestForm key="new" ledger={ledger} data={data} gardenId={id} />
      ) : page === 'vuon' && id && action === 'nhat-ky-moi' ? (
        <FarmLogForm key="new" ledger={ledger} data={data} gardenId={id} />
      ) : page === 'vuon' && id && action === 'nhat-ky' ? (
        <FarmLogBook data={data} gardenId={id} />
      ) : page === 'nhat-ky' && id ? (
        <FarmLogForm key={id} ledger={ledger} data={data} id={id} />
      ) : page === 'thu-hoach' && id ? (
        <HarvestForm key={id} ledger={ledger} data={data} id={id} />
      ) : page === 'mau' ? (
        <TemplateList ledger={ledger} data={data} />
      ) : page === 'o-tu-them' ? (
        <CustomFieldSettings ledger={ledger} data={data} />
      ) : page === 'cong' && id === 'cham' ? (
        <WorkDayForm key={query.get('nguoi') ?? 'all'} ledger={ledger} data={data} query={query} />
      ) : page === 'cong' && id === 'nguoi-moi' ? (
        <WorkerForm key="new" ledger={ledger} data={data} />
      ) : page === 'cong' && id === 'nguoi' && action && sub === 'sua' ? (
        <WorkerForm key={action} ledger={ledger} data={data} id={action} />
      ) : page === 'cong' && id === 'nguoi' && action ? (
        <WorkerDetail key={action} ledger={ledger} data={data} id={action} />
      ) : page === 'cong' ? (
        <WorkerList data={data} />
      ) : page === 'vuon' && id && action === 'vu-moi' ? (
        <SeasonForm key="new" ledger={ledger} data={data} gardenId={id} />
      ) : page === 'vuon' && id && action === 'vu' && sub ? (
        <SeasonForm key={sub} ledger={ledger} data={data} gardenId={id} id={sub} />
      ) : page === 'vuon' && id ? (
        <GardenDetail ledger={ledger} data={data} id={id} query={query} />
      ) : page === 'kho' && id === 'mua' ? (
        <SupplyForm key="new" ledger={ledger} data={data} />
      ) : page === 'kho' && id && action === 'sua' ? (
        <SupplyForm key={id} ledger={ledger} data={data} id={id} />
      ) : page === 'kho' && id ? (
        <SupplyDetail key={id} ledger={ledger} data={data} id={id} />
      ) : page === 'kho' ? (
        <SupplyList data={data} />
      ) : page === 'no' && id === 'nguoi' && action && sub ? (
        <PartyDebts key={`${action}|${sub}`} ledger={ledger} data={data} kind={action as DebtKind} party={sub} />
      ) : page === 'no' && id === 'moi' ? (
        <DebtForm key="new" ledger={ledger} data={data} />
      ) : page === 'no' && id && action === 'sua' ? (
        <DebtForm key={id} ledger={ledger} data={data} id={id} />
      ) : page === 'no' && id ? (
        <DebtDetail key={id} ledger={ledger} data={data} id={id} />
      ) : page === 'no' ? (
        <DebtList data={data} />
      ) : page === 'ban' && id === 'moi' ? (
        <ContractForm key="new" ledger={ledger} data={data} query={query} />
      ) : page === 'ban' && id && action === 'sua' ? (
        <ContractForm key={id} ledger={ledger} data={data} id={id} query={query} />
      ) : page === 'ban' && id && action === 'dot-moi' ? (
        <CutForm key="new" ledger={ledger} data={data} contractId={id} />
      ) : page === 'ban' && id && action === 'dot' && sub ? (
        <CutForm key={sub} ledger={ledger} data={data} contractId={id} id={sub} />
      ) : page === 'ban' && id ? (
        <ContractDetail key={id} ledger={ledger} data={data} id={id} />
      ) : page === 'ban' ? (
        <ContractList data={data} />
      ) : page === 'khoan' ? (
        <AllEntries ledger={ledger} data={data} query={query} />
      ) : page === 'cai-dat' ? (
        <LedgerSettings ledger={ledger} data={data} />
      ) : (
        <LedgerHome ledger={ledger} data={data} />
      )}
    </>
  )
}
