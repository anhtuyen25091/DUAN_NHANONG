import { articleDate, type ArticleSummary } from '@nhanong/shared'
import { api } from '../api'
import { href, useAsync } from '../hooks'

/** Thẻ 1 bài viết trong danh sách; big: bài nổi bật (ảnh to, đầu trang) */
export function ArticleCard({ article, big = false }: { article: ArticleSummary; big?: boolean }) {
  return (
    <a className={`article-card${big ? ' big' : ''}`} href={href(`bai-viet/${article.slug}`)}>
      <div className="article-cover" aria-hidden>
        {article.cover_url ? <img src={article.cover_url} alt="" loading="lazy" /> : <span>{article.category.icon ?? '📰'}</span>}
      </div>
      <div className="article-card-body">
        <span className="article-meta">
          {article.category.icon} {article.category.name} · {articleDate(article.published_at)}
        </span>
        <h3>{article.title}</h3>
        {article.excerpt && <p className="article-excerpt">{article.excerpt}</p>}
      </div>
    </a>
  )
}

/** Danh sách gọn (tiêu đề + ngày), dùng ở Bảng giá / trang mặt hàng; ẩn hẳn khi không có bài */
function CompactList({ title, articles, moreHref }: { title: string; articles: ArticleSummary[]; moreHref: string }) {
  if (articles.length === 0) return null
  return (
    <section className="card article-compact">
      <div className="card-head">
        <h2>{title}</h2>
        <a href={moreHref}>Xem tất cả ›</a>
      </div>
      <ul>
        {articles.map((article) => (
          <li key={article.slug}>
            <a href={href(`bai-viet/${article.slug}`)}>
              <span className="article-compact-icon" aria-hidden>
                {article.cover_url ? <img src={article.cover_url} alt="" loading="lazy" /> : (article.category.icon ?? '📰')}
              </span>
              <span>
                <b>{article.title}</b>
                <br />
                <span className="small muted">
                  {article.category.name} · {articleDate(article.published_at)}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** "📰 Bài viết mới" trên Bảng giá */
export function LatestArticles() {
  const [state] = useAsync(() => api.articles({ per_page: 3 }), [])
  return state.status === 'ok' ? <CompactList title="📰 Bài viết mới" articles={state.data.data} moreHref={href('bai-viet')} /> : null
}

/** Bài viết gắn với 1 mặt hàng (trang giá mặt hàng) */
export function ProductArticles({ productCode }: { productCode: string }) {
  const [state] = useAsync(() => api.articles({ product: productCode, per_page: 3 }), [productCode])
  return state.status === 'ok' ? (
    <CompactList title="📰 Bài viết liên quan" articles={state.data.data} moreHref={href('bai-viet', { mat_hang: productCode })} />
  ) : null
}
