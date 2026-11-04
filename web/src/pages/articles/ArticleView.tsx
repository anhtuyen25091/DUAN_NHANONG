import { articleDate } from '@nhanong/shared'
import { useEffect } from 'react'
import { api } from '../../api'
import { ArticleCard } from '../../components/ArticleCards'
import { Status } from '../../components/Status'
import { href, useAsync } from '../../hooks'

export function ArticleView({ slug }: { slug: string }) {
  const [state, retry] = useAsync(() => api.article(slug), [slug])
  const article = state.status === 'ok' ? state.data.data : null

  // Mở bài khác từ "Bài cùng chủ đề" thì cuộn lên đầu; tiêu đề tab = tên bài
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [slug])
  useEffect(() => {
    if (!article) return
    document.title = `${article.title} · Nhà Nông`
    return () => {
      document.title = 'Nhà Nông'
    }
  }, [article])

  return (
    <>
      <a className="back" href={href('bai-viet', article ? { danh_muc: article.category.slug } : {})}>
        ‹ {article ? article.category.name : 'Bài viết'}
      </a>
      <Status state={state} retry={retry} />
      {state.status === 'ok' && article && (
        <article className="article-page">
          <p className="article-meta">
            <a href={href('bai-viet', { danh_muc: article.category.slug })}>
              {article.category.icon} {article.category.name}
            </a>{' '}
            · {articleDate(article.published_at)} · {article.views.toLocaleString('vi-VN')} lượt xem
          </p>
          <h1>{article.title}</h1>
          {article.excerpt && <p className="article-lead">{article.excerpt}</p>}
          {article.cover_url && <img className="article-hero" src={article.cover_url} alt="" />}
          {/* Máy chủ đã lọc HTML (bỏ script, thuộc tính sự kiện) trước khi gửi */}
          <div className="article-body" dangerouslySetInnerHTML={{ __html: article.content_html }} />

          {article.source_name && (
            <p className="small muted">
              Nguồn tham khảo:{' '}
              {article.source_url ? (
                <a href={article.source_url} target="_blank" rel="noopener noreferrer nofollow">
                  {article.source_name}
                </a>
              ) : (
                article.source_name
              )}
            </p>
          )}

          {article.products.length > 0 && (
            <div className="article-products">
              <span className="small muted">Xem giá:</span>
              {article.products.map((p) => (
                <a key={p.code} className="badge" href={href(`san-pham/${p.code}`)}>
                  {p.name}
                </a>
              ))}
            </div>
          )}
        </article>
      )}

      {state.status === 'ok' && state.data.related.length > 0 && (
        <>
          <h2 className="section-title">Bài cùng chủ đề</h2>
          <div className="article-grid">
            {state.data.related.map((a) => (
              <ArticleCard key={a.slug} article={a} />
            ))}
          </div>
        </>
      )}
    </>
  )
}
