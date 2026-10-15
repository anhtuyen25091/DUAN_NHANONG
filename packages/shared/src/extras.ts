/**
 * Tính toán cho khoản hay dùng, thu hoạch, nhân công và ô tự thêm (hàm thuần, dùng cho màn hình + test).
 */
import { cutKg, formatQty, formatQtyGrouped } from './advanced';
import { formatDate } from './format';
import type { Ledger, LedgerSnapshot } from './ledger';
import { formatVnd } from './money';
import type { CustomFieldDef, CustomFieldTarget, CustomFieldType, Harvest, Worker, WorkLog } from './types';

// ---- Thu hoạch ----

/** Đơn vị hay dùng; quy ra kg được thì cộng chung để tính giá thành / kg */
export const HARVEST_UNITS = ['kg', 'tạ', 'tấn', 'trái', 'buồng', 'bao'];
const KG_PER_UNIT: Record<string, number> = { kg: 1, tạ: 100, tấn: 1000 };

export function toKg(quantity: number, unit: string): number | null {
  const rate = KG_PER_UNIT[unit.trim().toLowerCase()];
  return rate ? quantity * rate : null;
}

export interface HarvestTotals {
  /** Tổng theo từng đơn vị (vd 1.200 kg, 300 trái) */
  byUnit: Array<{ unit: string; quantity: number }>;
  /** Tổng quy ra kg: sản lượng ghi tay (đơn vị kg / tạ / tấn) + số kg đã cắt cho lái */
  kg: number;
  /** Phần trong `kg` đến từ các đợt cắt bán cho lái (không cần ghi lại ở Thu hoạch) */
  cutKg: number;
  /** Tiền đã bán ghi kèm sản lượng */
  sold: number;
}

export function harvestTotals(
  data: Pick<LedgerSnapshot, 'harvests' | 'harvest_contracts' | 'harvest_cuts'>,
  gardenId: string,
  range: { from?: string; to?: string } = {},
): HarvestTotals {
  const inRange = (date: string) => (!range.from || date >= range.from) && (!range.to || date <= range.to);
  const units = new Map<string, number>();
  let kg = 0;
  let sold = 0;
  for (const h of data.harvests) {
    if (h.garden_id !== gardenId || !inRange(h.date)) continue;
    units.set(h.unit, (units.get(h.unit) ?? 0) + h.quantity);
    kg += toKg(h.quantity, h.unit) ?? 0;
    if (h.price) sold += Math.round(h.quantity * h.price);
  }
  const contracts = new Set(data.harvest_contracts.filter((c) => c.garden_id === gardenId).map((c) => c.id));
  let fromCuts = 0;
  for (const cut of data.harvest_cuts) if (contracts.has(cut.contract_id) && inRange(cut.date)) fromCuts += cutKg(cut.lines);
  if (fromCuts > 0) units.set('kg', (units.get('kg') ?? 0) + fromCuts);
  return { byUnit: [...units].map(([unit, quantity]) => ({ unit, quantity })), kg: kg + fromCuts, cutKg: fromCuts, sold };
}

/** Giá thành = tiền chi / sản lượng; chưa có sản lượng thì null */
export function costPerUnit(expense: number, quantity: number): number | null {
  return quantity > 0 ? Math.round(expense / quantity) : null;
}

export function formatHarvest(h: Pick<Harvest, 'quantity' | 'unit' | 'crop'>): string {
  return `${formatQtyGrouped(h.quantity)} ${h.unit}${h.crop ? ` ${h.crop.toLowerCase()}` : ''}`;
}

// ---- Nhân công ----

export interface WorkerBalance {
  worker: Worker;
  /** Ngày công chưa trả và số tiền còn nợ */
  unpaidDays: number;
  owed: number;
  unpaidLogs: WorkLog[];
  /** Tổng đã trả từ trước tới nay */
  paid: number;
  lastWorked: string | null;
}

export function workLogAmount(log: Pick<WorkLog, 'days' | 'wage'>): number {
  return Math.round(log.days * log.wage);
}

export function workerBalances(data: Pick<LedgerSnapshot, 'workers' | 'work_logs'>): WorkerBalance[] {
  return data.workers.map((worker) => {
    const logs = data.work_logs.filter((l) => l.worker_id === worker.id);
    const unpaidLogs = logs.filter((l) => !l.paid_on);
    return {
      worker,
      unpaidDays: unpaidLogs.reduce((sum, l) => sum + l.days, 0),
      owed: unpaidLogs.reduce((sum, l) => sum + workLogAmount(l), 0),
      unpaidLogs,
      paid: logs.filter((l) => l.paid_on).reduce((sum, l) => sum + workLogAmount(l), 0),
      lastWorked: logs.reduce<string | null>((last, l) => (!last || l.date > last ? l.date : last), null),
    };
  });
}

/** "1 ngày" / "nửa ngày" / "2,5 ngày" */
export function formatDays(days: number): string {
  return days === 0.5 ? 'nửa ngày' : `${formatQtyGrouped(days)} ngày`;
}

// ---- Ô tự thêm ----

export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: 'Chữ',
  number: 'Số',
  date: 'Ngày',
  select: 'Chọn 1 trong danh sách',
};

export const CUSTOM_FIELD_TARGET_LABELS: Record<CustomFieldTarget, string> = {
  garden: 'Vườn',
  transaction: 'Khoản thu chi',
  supply: 'Vật tư',
};

export function fieldsFor(fields: CustomFieldDef[], target: CustomFieldTarget): CustomFieldDef[] {
  return fields.filter((f) => f.target === target);
}

/** Giá trị để hiển thị; chưa nhập thì null */
export function formatFieldValue(field: Pick<CustomFieldDef, 'type'>, value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (field.type === 'date' && typeof value === 'string') return formatDate(value);
  if (field.type === 'number' && typeof value === 'number') return formatQtyGrouped(value);
  return String(value);
}

/** Các dòng "Tên ô: giá trị" của 1 bản ghi (bỏ ô chưa nhập) */
export function fieldLines(fields: CustomFieldDef[], target: CustomFieldTarget, extra: Record<string, string | number | null> | undefined): Array<{ label: string; value: string }> {
  return fieldsFor(fields, target)
    .map((f) => ({ label: f.label, value: formatFieldValue(f, extra?.[f.key]) }))
    .filter((l): l is { label: string; value: string } => l.value !== null);
}

/** Chữ người dùng gõ → giá trị lưu (số thì đổi "2,5" → 2.5; sai thì bỏ) */
export function parseFieldInput(field: Pick<CustomFieldDef, 'type'>, text: string): string | number | null {
  const t = text.trim();
  if (!t) return null;
  if (field.type === 'number') {
    const n = Number(t.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return t;
}

/** Tiền công 1 ngày dạng "300.000 đ/ngày" */
export function formatWage(wage: number): string {
  return `${formatVnd(wage)}/ngày`;
}

/** Giá trị đã lưu → chữ để điền sẵn vào ô nhập (số dùng formatQty "2,5", không nhóm hàng nghìn) */
export function extraTexts(fields: CustomFieldDef[], target: CustomFieldTarget, extra: Record<string, string | number | null> | undefined): Record<string, string> {
  const texts: Record<string, string> = {};
  for (const f of fieldsFor(fields, target)) {
    const v = extra?.[f.key];
    texts[f.key] = v === null || v === undefined ? '' : typeof v === 'number' ? formatQty(v) : v;
  }
  return texts;
}

/** Lưu giá trị các ô tự thêm của 1 bản ghi từ chữ người dùng gõ (ô để trống thì xóa giá trị) */
export function saveExtra(ledger: Ledger, fields: CustomFieldDef[], target: CustomFieldTarget, id: string, texts: Record<string, string>): Promise<void> {
  const list = fieldsFor(fields, target);
  if (list.length === 0) return Promise.resolve();
  return ledger.setExtra(target, id, Object.fromEntries(list.map((f) => [f.key, parseFieldInput(f, texts[f.key] ?? '')])));
}
