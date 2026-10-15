import { fieldsFor, formatQty, parseFieldInput, type CustomFieldDef, type CustomFieldTarget, type Ledger } from '@nhanong/shared'

type Extra = Record<string, string | number | null> | undefined

/** Giá trị đã lưu → chữ để điền sẵn vào ô (số dùng formatQty: "2,5", không nhóm hàng nghìn) */
export function extraTexts(fields: CustomFieldDef[], target: CustomFieldTarget, extra: Extra): Record<string, string> {
  const texts: Record<string, string> = {}
  for (const f of fieldsFor(fields, target)) {
    const v = extra?.[f.key]
    texts[f.key] = v === null || v === undefined ? '' : typeof v === 'number' ? formatQty(v) : v
  }
  return texts
}

/** Lưu giá trị các ô tự thêm của 1 bản ghi (ô để trống thì xóa giá trị) */
export function saveExtra(ledger: Ledger, fields: CustomFieldDef[], target: CustomFieldTarget, id: string, texts: Record<string, string>) {
  const list = fieldsFor(fields, target)
  if (list.length === 0) return Promise.resolve()
  return ledger.setExtra(target, id, Object.fromEntries(list.map((f) => [f.key, parseFieldInput(f, texts[f.key] ?? '')])))
}
