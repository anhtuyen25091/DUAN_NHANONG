import { formatQty } from '@nhanong/shared'

/** "2,5" hoặc "2.5" -> 2.5; trống/sai -> 0 */
export function parseQty(text: string): number {
  const n = Number(text.replace(',', '.').replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/** Số lượng -> chữ để điền sẵn vào ô (0 -> trống) */
export const qtyText = (n: number) => (n ? formatQty(n) : '')
