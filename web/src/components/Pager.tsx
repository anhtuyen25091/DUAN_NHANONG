/** "‹ Trước · Trang 2/7 · Sau ›"; ẩn khi chỉ có 1 trang */
export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  if (pages <= 1) return null
  return (
    <nav className="pager" aria-label="Phân trang">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ‹ Trước
      </button>
      <span>
        Trang <b>{page}</b>/{pages}
      </span>
      <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Sau ›
      </button>
    </nav>
  )
}
