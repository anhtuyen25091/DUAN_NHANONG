/**
 * Ảnh hóa đơn của sổ thu chi. Ảnh không nằm trong bản ghi (giới hạn 20 KB / bản ghi): khoản thu chi chỉ giữ photo_id,
 * ảnh lưu riêng trên máy (web: IndexedDB, app: thư mục tài liệu) và gửi / tải riêng khi "lưu cả trên mạng".
 */
import type { LedgerSnapshot } from './ledger';

/** Nén ảnh trước khi lưu: cạnh dài nhất (px) và chất lượng JPEG */
export const RECEIPT_MAX_SIDE = 1280;
export const RECEIPT_QUALITY = 0.7;

/** Kích thước mới giữ tỉ lệ, cạnh dài không quá max (ảnh nhỏ hơn thì giữ nguyên) */
export function fitSize(width: number, height: number, max = RECEIPT_MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Ảnh đang được dùng: của khoản còn (chưa xóa) */
export function usedPhotos(snapshot: Pick<LedgerSnapshot, 'transactions'>): Set<string> {
  return new Set(snapshot.transactions.filter((t) => !t.deleted_at && t.photo_id).map((t) => t.photo_id as string));
}

/**
 * Sau mỗi lần đồng bộ sổ: ảnh nào cần gửi lên (có trên máy, đang dùng, chưa gửi) và cần tải về (đang dùng, máy chưa có,
 * vd ghi ở máy khác). Ảnh không còn khoản nào dùng thì không gửi / tải.
 */
export function photosToSync(
  snapshot: Pick<LedgerSnapshot, 'transactions'>,
  local: { has: ReadonlySet<string>; uploaded: ReadonlySet<string> },
): { upload: string[]; download: string[] } {
  const used = [...usedPhotos(snapshot)];
  return {
    upload: used.filter((id) => local.has.has(id) && !local.uploaded.has(id)),
    download: used.filter((id) => !local.has.has(id)),
  };
}
