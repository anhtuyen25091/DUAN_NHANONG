import { useLedger } from '../../ledger/useLedger'
import { hideToast, useToast } from '../../ledger/toast'
import { AddEntry } from './AddEntry'
import { ChooseMode } from './ChooseMode'
import { GardenDetail } from './GardenDetail'
import { GardenForm } from './GardenForm'
import { LedgerHome } from './LedgerHome'
import { LedgerSettings } from './LedgerSettings'

/** Mọi trang dưới #/so/... (tải riêng, không làm nặng trang bảng giá) */
export default function LedgerRoutes({ path, query }: { path: string[]; query: URLSearchParams }) {
  const state = useLedger()

  if (!state.ledger)
    return state.error ? (
      <div className="notice error">Trình duyệt không cho lưu dữ liệu (có thể đang ở chế độ ẩn danh). Hãy mở bằng cửa sổ thường.</div>
    ) : (
      <p className="muted center">Đang mở sổ…</p>
    )

  const { ledger, data } = state
  if (!data.meta.storage_mode) return <ChooseMode ledger={ledger} />

  const [, page, id, action] = path
  return (
    <>
      {page === 'ghi' ? (
        <AddEntry key={query.get('sua') ?? 'new'} ledger={ledger} data={data} query={query} />
      ) : page === 'vuon-moi' ? (
        <GardenForm ledger={ledger} data={data} />
      ) : page === 'vuon' && id && action === 'sua' ? (
        <GardenForm ledger={ledger} data={data} id={id} />
      ) : page === 'vuon' && id ? (
        <GardenDetail ledger={ledger} data={data} id={id} />
      ) : page === 'cai-dat' ? (
        <LedgerSettings ledger={ledger} data={data} />
      ) : (
        <LedgerHome ledger={ledger} data={data} />
      )}
      <ToastBar />
    </>
  )
}

function ToastBar() {
  const toast = useToast()
  if (!toast) return null
  return (
    <div className="toast" role="status">
      <span>{toast.message}</span>
      {toast.undo && (
        <button
          type="button"
          onClick={() => {
            toast.undo!()
            hideToast()
          }}
        >
          Hoàn tác
        </button>
      )}
    </div>
  )
}
