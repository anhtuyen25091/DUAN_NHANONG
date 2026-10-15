import { today } from '@nhanong/shared'

export type Period = 'month' | 'year' | 'all'

export const PERIOD_LABELS: Record<Period, string> = { month: 'Tháng này', year: 'Năm nay', all: 'Tất cả' }

export function periodRange(period: Period, now = today()): { from?: string } {
  if (period === 'month') return { from: `${now.slice(0, 7)}-01` }
  if (period === 'year') return { from: `${now.slice(0, 4)}-01-01` }
  return {}
}
