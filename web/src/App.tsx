import { lazy, Suspense, useEffect } from 'react'
import { Notices } from './components/Notices'
import { startDealWatch, useDealWatch } from './dealWatch'
import { href, useRoute } from './hooks'
import { startPurchaseOutbox } from './outbox'
import { Account } from './pages/Account'
import { BuyerArea } from './pages/BuyerArea'
import { LocalPrices } from './pages/LocalPrices'
import { PriceBoard } from './pages/PriceBoard'
import { ProductDetail } from './pages/ProductDetail'
import { ShopList } from './pages/ShopList'
import { ForgotPassword } from './pages/ForgotPassword'
import { ShopRemove } from './pages/ShopRemove'
import { ShopSubmit } from './pages/ShopSubmit'

const LedgerRoutes = lazy(() => import('./pages/ledger/LedgerRoutes'))
const DealRoutes = lazy(() => import('./pages/deals/DealRoutes'))
const TradeRoutes = lazy(() => import('./pages/trade/TradeRoutes'))
const BusinessPage = lazy(() => import('./pages/business/BusinessPage'))
const OfferRoutes = lazy(() => import('./pages/offers/OfferRoutes'))

export default function App() {
  const { path, query } = useRoute()
  const { awaiting } = useDealWatch()
  useEffect(() => startDealWatch(), [])
  useEffect(() => startPurchaseOutbox(), [])
  // Số mục chờ xác nhận hiện cả trên tiêu đề tab trình duyệt
  useEffect(() => {
    document.title = awaiting > 0 ? `(${awaiting}) Nhà Nông` : 'Nhà Nông'
  }, [awaiting])
  const section =
    path[0] === 'diem-ban'
      ? 'shops'
      : path[0] === 'so'
        ? 'ledger'
        : path[0] === 'don' || path[0] === 'giao-dich' || path[0] === 'doanh-nghiep' || path[0] === 'chao-ban'
          ? 'deals'
          : path[0] === 'tai-khoan' || path[0] === 'diem-mua'
            ? 'account'
            : 'prices'

  return (
    <>
      <header className="topbar">
        <a href={href('')} className="brand" aria-label="Nhà Nông, về bảng giá">
          🌾 <span className="brand-name">Nhà Nông</span>
        </a>
        {/* Máy tính: menu trên đầu; điện thoại: thanh dưới đáy, biểu tượng to dễ bấm (CSS) */}
        <nav className="topnav" aria-label="Mục chính">
          <a href={href('')} aria-current={section === 'prices' ? 'page' : undefined}>
            <span className="nav-icon" aria-hidden>
              🌾
            </span>
            <span className="nav-label">Bảng giá</span>
          </a>
          <a href={href('so')} aria-current={section === 'ledger' ? 'page' : undefined}>
            <span className="nav-icon" aria-hidden>
              📒
            </span>
            <span className="nav-label">Sổ thu chi</span>
          </a>
          <a href={href('don')} aria-current={section === 'deals' ? 'page' : undefined} aria-label={awaiting > 0 ? `Đơn, ${awaiting} mục chờ bạn xác nhận` : undefined}>
            <span className="nav-icon" aria-hidden>
              🤝{awaiting > 0 && <span className="nav-badge">{awaiting}</span>}
            </span>
            <span className="nav-label">Đơn</span>
          </a>
          <a href={href('diem-ban')} aria-current={section === 'shops' ? 'page' : undefined}>
            <span className="nav-icon" aria-hidden>
              🏪
            </span>
            <span className="nav-label">Điểm bán</span>
          </a>
          <a href={href('tai-khoan')} aria-current={section === 'account' ? 'page' : undefined}>
            <span className="nav-icon" aria-hidden>
              👤
            </span>
            <span className="nav-label">Tài khoản</span>
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
        ) : path[0] === 'giao-dich' ? (
          <Suspense fallback={<p className="muted center">Đang mở…</p>}>
            <TradeRoutes path={path} query={query} />
          </Suspense>
        ) : path[0] === 'chao-ban' ? (
          <Suspense fallback={<p className="muted center">Đang mở…</p>}>
            <OfferRoutes path={path} query={query} />
          </Suspense>
        ) : path[0] === 'doanh-nghiep' ? (
          <Suspense fallback={<p className="muted center">Đang mở…</p>}>
            <BusinessPage query={query} />
          </Suspense>
        ) : path[0] === 'gia-quanh-toi' ? (
          <LocalPrices query={query} />
        ) : path[0] === 'diem-mua' ? (
          <BuyerArea />
        ) : path[0] === 'tai-khoan' && path[1] === 'quen-mat-khau' ? (
          <ForgotPassword />
        ) : path[0] === 'tai-khoan' ? (
          <Account query={query} />
        ) : path[0] === 'diem-ban' && path[1] === 'xin-go' ? (
          <ShopRemove query={query} />
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
