import { ArticleList } from './ArticleList'
import { ArticleView } from './ArticleView'

/** #/bai-viet (danh sách, lọc ?danh_muc=&mat_hang=&q=) và #/bai-viet/<slug> (đọc bài); tải riêng khi mở mục */
export default function ArticleRoutes({ path, query }: { path: string[]; query: URLSearchParams }) {
  return path[1] ? <ArticleView slug={path[1]} /> : <ArticleList query={query} />
}
