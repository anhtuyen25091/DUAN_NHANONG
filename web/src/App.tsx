import { lazy, Suspense } from 'react'
import { href, useRoute } from './hooks'
import { Account } from './pages/Account'
import { PriceBoard } from './pages/PriceBoard'
import { ProductDetail } from './pages/ProductDetail'
import { ShopList } from './pages/ShopList'
import { ShopSubmit } from './pages/ShopSubmit'

const LedgerRoutes = lazy(() => import('./pages/ledger/LedgerRoutes'))

export default function App() {
  const { path, query } = useRoute()
  const section = path[0] === 'diem-ban' ? 'shops' : path[0] === 'so' ? 'ledger' : 'prices'

  return (
    <>
      <header className="topbar">
        <a href={href('')} className="brand">
          🌾 Nhà Nông
        </a>
        <nav className="topnav">
          <a href={href('')} aria-current={section === 'prices' ? 'page' : undefined}>
            Bảng giá
          </a>
          <a href={href('so')} aria-current={section === 'ledger' ? 'page' : undefined}>
            Sổ thu chi
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
    </>
  )
}
