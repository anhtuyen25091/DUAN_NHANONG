import { Ledger, type LedgerSnapshot } from '@nhanong/shared'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { indexedDbStorage } from './storage'
import { startSync } from './sync'

let opening: Promise<Ledger> | null = null

/** Mở sổ một lần cho cả app (kèm bộ đồng bộ, chỉ chạy khi người dùng bật "lưu cả trên mạng") */
export function openLedger(): Promise<Ledger> {
  opening ??= indexedDbStorage()
    .then((storage) => Ledger.open(storage))
    .then((ledger) => {
      startSync(ledger)
      return ledger
    })
  return opening
}

const noop = () => () => {}

/** null khi sổ đang mở; error khi trình duyệt chặn lưu trữ */
export function useLedger(): { ledger: Ledger; data: LedgerSnapshot } | { ledger: null; error: Error | null } {
  const [ledger, setLedger] = useState<Ledger | null>(null)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    openLedger().then(setLedger, (e: Error) => setError(e))
  }, [])

  const data = useSyncExternalStore(ledger?.subscribe ?? noop, () => ledger?.getSnapshot() ?? null)
  return ledger && data ? { ledger, data } : { ledger: null, error }
}
