import { lazy, Suspense, useEffect } from 'react'
import { Notices } from './components/Notices'
import { startDealWatch, useDealWatch } from './dealWatch'
import { href, useRoute } from './hooks'
import { Account } from './pages/Account'
import { BuyerArea } from './pages/BuyerArea'
import { LocalPrices } from './pages/LocalPrices'
import { PriceBoard } from './pages/PriceBoard'
import { ProductDetail } from './pages/ProductDetail'
import { ShopList } from './pages/ShopList'
import { ShopSubmit } from './pages/ShopSubmit'

const LedgerRoutes = lazy(() => import('./pages/ledger/LedgerRoutes'))
const DealRoutes = lazy(() => import('./pages/deals/DealRoutes'))

export default function App() {
  const { path, query } = useRoute()
  const { awaiting } = useDealWatch()
  useEffect(() => startDealWatch(), [])
  // Số mục chờ xác nhận hiện cả trên tiêu đề tab trình duyệt
  useEffect(() => {
    document.title = awaiting > 0 ? `(${awaiting}) Nhà Nông` : 'Nhà Nông'
  }, [awaiting])
  const section = path[0] === 'diem-ban' ? 'shops' : path[0] === 'so' ? 'ledger' : path[0] === 'don' ? 'deals' : 'prices'

  return (
    <>
      <header className="topbar">
        <a href={href('')} className="brand" aria-label="Nhà Nông, về bảng giá">
          🌾 <span className="brand-name">Nhà Nông</span>
        </a>
        <nav className="topnav">
          <a href={href('')} aria-current={section === 'prices' ? 'page' : undefined}>
            Bảng giá
          </a>
          <a href={href('so')} aria-current={section === 'ledger' ? 'page' : undefined}>
            Sổ thu chi
          </a>
          <a href={href('don')} aria-current={section === 'deals' ? 'page' : undefined} aria-label={awaiting > 0 ? `Đơn, ${awaiting} mục chờ bạn xác nhận` : undefined}>
            Đơn{awaiting > 0 && <span className="nav-badge">{awaiting}</span>}
          </a>
          <a href={href('diem-ban')} aria-current={section === 'shops' ? 'page' : undefined}>
            Điểm bán
          </a>
          <a href={href('tai-khoan')} aria-current={path[0] === 'tai-khoan' ? 'page' : undefined} aria-label="Tài khoản">
            👤
          </a>
        </nav>
      </header>
      <main>
        {path[0] === 'san-pham' && path[1] ? (
          <ProductDetail code={path[1]} query={query} />
        ) : path[0] === 'so' ? (
          <Suspense fallback={<p className="muted center">Đang mở sổ…</p>}>
            <LedgerRoutes path={path} query={query} />
          </Suspense>
        ) : path[0] === 'don' ? (
          <Suspense fallback={<p className="muted center">Đang mở…</p>}>
            <DealRoutes path={path} query={query} />
          </Suspense>
        ) : path[0] === 'gia-quanh-toi' ? (
          <LocalPrices query={query} />
        ) : path[0] === 'diem-mua' ? (
          <BuyerArea />
        ) : path[0] === 'tai-khoan' ? (
          <Account query={query} />
        ) : path[0] === 'diem-ban' && path[1] === 'de-xuat' ? (
          <ShopSubmit query={query} />
        ) : path[0] === 'diem-ban' ? (
          <ShopList query={query} />
        ) : (
          <PriceBoard query={query} />
        )}
      </main>
      <Notices />
    </>
  )
}
