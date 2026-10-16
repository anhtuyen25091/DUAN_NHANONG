import { monthStart, today } from '@nhanong/shared'
import { useState } from 'react'

/** Khoảng ngày: mặc định đầu tháng → hôm nay */
export function useRange() {
  const [from, setFrom] = useState(monthStart(today()))
  const [to, setTo] = useState(today())
  return { from, to, setFrom, setTo }
}
