import type { ArticleSummary } from '@nhanong/shared'
import { useEffect, useState } from 'react'
import { api } from '../../api'
import { ArticleCard } from '../../components/ArticleCards'
import { Status } from '../../components/Status'
import { replaceQuery, useAsync } from '../../hooks'

export function ArticleList({ query }: { query: URLSearchParams }) {
  const category = query.get('danh_muc') ?? ''
  const product = query.get('mat_hang') ?? ''
  const q = query.get('q') ?? ''
  const [search, setSearch] = useState(q)
  const [more, setMore] = useState<{ articles: ArticleSummary[]; page: number; hasMore: boolean } | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const setFilter = (next: { danh_muc?: string; mat_hang?: string; q?: string }) =>
    replaceQuery('bai-viet', { danh_muc: category, mat_hang: product, q, ...next })

  // Gõ xong 0,4 giây mới tìm
  useEffect(() => {
    if (search === q) return
    const timer = setTimeout(() => setFilter({ q: search.trim() }), 400)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const filters = { category, product, q }
  const [categories] = useAsync(() => api.articleCategories(), [])
  const [first, retry] = useAsync(() => {
    setMore(null)
    return api.articles(filters)
  }, [category, product, q])

  const loadMore = async () => {
    if (first.status !== 'ok') return
    const page = (more?.page ?? first.data.meta.page) + 1
    setLoadingMore(true)
    try {
      const next = await api.articles({ ...filters, page })
      setMore({ articles: [...(more?.articles ?? []), ...next.data], page, hasMore: next.meta.has_more })
    } finally {
      setLoadingMore(false)
    }
  }

  const list = first.status === 'ok' ? [...first.data.data, ...(more?.articles ?? [])] : []
  const hasMore = first.status === 'ok' && (more ? more.hasMore : first.data.meta.has_more)
  const filtered = category !== '' || product !== '' || q !== ''
  // Trang đầu, không lọc: bài nổi bật mới nhất lên đầu, ảnh to
  const featured = !filtered ? list.find((a) => a.is_featured) : undefined
  const rest = featured ? list.filter((a) => a !== featured) : list
  const current = categories.status === 'ok' ? categories.data.find((c) => c.slug === category) : undefined

  return (
    <>
      <div className="title-row">
        <h1>📰 Bài viết</h1>
      </div>
      <p className="muted">{current?.description ?? 'Kỹ thuật canh tác, sâu bệnh, thị trường và kinh nghiệm cho nhà nông.'}</p>

      <nav className="chip-row" aria-label="Danh mục bài viết">
        <button type="button" className={category === '' ? 'active' : ''} aria-pressed={category === ''} onClick={() => setFilter({ danh_muc: '' })}>
          Tất cả
        </button>
        {categories.status === 'ok' &&
          categories.data.map((c) => (
            <button key={c.slug} type="button" className={c.slug === category ? 'active' : ''} aria-pressed={c.slug === category} onClick={() => setFilter({ danh_muc: c.slug })}>
              {c.icon} {c.name}
              {!!c.articles_count && <span className="chip-count">{c.articles_count}</span>}
            </button>
          ))}
      </nav>

      <div className="filters">
        <input type="search" placeholder="Tìm bài viết…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Tìm bài viết" />
      </div>
      {product && (
        <p className="small">
          Đang xem bài về mặt hàng <b>{product}</b>.{' '}
          <button type="button" className="linklike" onClick={() => setFilter({ mat_hang: '' })}>
            Bỏ lọc
          </button>
        </p>
      )}

      <Status state={first} retry={retry} />
      {first.status === 'ok' && list.length === 0 && <div className="notice">{filtered ? 'Không có bài viết phù hợp.' : 'Chưa có bài viết nào.'}</div>}

      {featured && <ArticleCard article={featured} big />}
      <div className="article-grid">
        {rest.map((article) => (
          <ArticleCard key={article.slug} article={article} />
        ))}
      </div>
      {hasMore && (
        <p className="center">
          <button type="button" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Đang tải…' : 'Xem thêm bài'}
          </button>
        </p>
      )}
    </>
  )
}
