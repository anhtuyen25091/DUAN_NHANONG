/**
 * Bài viết do admin soạn (mục "📰 Bài viết"): kiểu dữ liệu + hàm định dạng dùng chung cho web và app.
 */
import type { Product } from './api';

export interface ArticleCategory {
  slug: string;
  name: string;
  icon: string | null;
  description: string | null;
  /** Số bài đã đăng */
  articles_count?: number;
}

export interface ArticleSummary {
  slug: string;
  title: string;
  excerpt: string | null;
  cover_url: string | null;
  category: ArticleCategory;
  published_at: string;
  is_featured: boolean;
  views: number;
}

export interface Article extends ArticleSummary {
  /** HTML đã được máy chủ lọc (không có script / thuộc tính sự kiện) */
  content_html: string;
  source_name: string | null;
  source_url: string | null;
  products: Product[];
}

export interface ArticleFilters {
  category?: string;
  product?: string;
  q?: string;
  featured?: 1;
  page?: number;
  per_page?: number;
}

export interface ArticlePage {
  data: ArticleSummary[];
  meta: { page: number; has_more: boolean; total: number };
}

export interface ArticleDetail {
  data: Article;
  related: ArticleSummary[];
}

/** "Hôm nay", "Hôm qua", "3 ngày trước", quá 7 ngày thì ngày/tháng/năm */
export function articleDate(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days <= 0) return 'Hôm nay';
  if (days === 1) return 'Hôm qua';
  if (days < 7) return `${days} ngày trước`;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}
