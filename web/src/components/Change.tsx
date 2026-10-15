import { formatChange, trendOf } from '@nhanong/shared'

const ARROWS = { up: '▲', down: '▼', flat: '–', none: '' }

/** Mức tăng/giảm có màu + mũi tên (không chỉ dựa vào màu) */
export function Change({ value }: { value: number | null }) {
  const trend = trendOf(value)
  if (trend === 'none') return <span className="change none">mới</span>
  return (
    <span className={`change ${trend}`}>
      {ARROWS[trend]} {formatChange(value).replace(/^[+-]/, '')}
    </span>
  )
}
