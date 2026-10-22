/**
 * Nhật ký canh tác: tên loại việc, thời gian cách ly thuốc BVTV (chưa hết thì chưa nên thu hoạch),
 * và bản chữ của nhật ký 1 vườn để in / gửi (hồ sơ truy xuất nguồn gốc, mã vùng trồng).
 */
import { addDays, formatDate } from './format';
import { formatQty, formatQtyGrouped } from './advanced';
import type { FarmLog, FarmLogKind, Garden } from './types';

export const FARM_LOG_KINDS: FarmLogKind[] = ['spray', 'fertilize', 'water', 'prune', 'other'];

export const FARM_LOG_KIND_LABELS: Record<FarmLogKind, string> = {
  spray: '🧴 Phun thuốc',
  fertilize: '🌱 Bón phân',
  water: '💧 Tưới nước',
  prune: '✂️ Tỉa cành, làm cỏ',
  other: '📝 Việc khác',
};

/** Thời gian cách ly hay gặp trên nhãn thuốc (ngày), để chọn nhanh */
export const WITHHOLDING_PRESETS = [7, 14, 21, 30];

export interface Withholding {
  /** Ngày đầu tiên được thu hoạch (hết cách ly) */
  safe_from: string;
  /** Lần phun làm cách ly kéo dài nhất */
  log: FarmLog;
  days_left: number;
}

/**
 * Vườn còn trong thời gian cách ly vào ngày `on` không: lần phun nào có (ngày phun + số ngày cách ly) muộn nhất.
 * Hết cách ly (hoặc chưa phun thuốc có cách ly) thì null.
 */
export function withholdingOn(logs: FarmLog[], gardenId: string, on: string): Withholding | null {
  let worst: Withholding | null = null;
  for (const log of logs) {
    if (log.garden_id !== gardenId || log.deleted_at || log.kind !== 'spray' || !log.withholding_days || log.date > on) continue;
    const safeFrom = addDays(log.date, log.withholding_days);
    if (safeFrom > on && (!worst || safeFrom > worst.safe_from)) {
      worst = { safe_from: safeFrom, log, days_left: daysBetween(on, safeFrom) };
    }
  }
  return worst;
}

/** "Còn cách ly tới 30/10 (phun Regent ngày 16/10, cách ly 14 ngày)" */
export function withholdingText(w: Withholding): string {
  return `Còn cách ly ${w.days_left} ngày, thu hoạch từ ${formatDate(w.safe_from)} (phun ${w.log.title} ngày ${formatDate(w.log.date)}, cách ly ${w.log.withholding_days} ngày)`;
}

/** 1 dòng nhật ký: "16/10/2026 · 🧴 Phun thuốc · Regent 2 chai · trị sâu đục thân · cách ly 14 ngày" */
export function farmLogLine(log: FarmLog): string {
  return [
    formatDate(log.date),
    FARM_LOG_KIND_LABELS[log.kind],
    `${log.title}${log.quantity ? ` ${formatQty(log.quantity)}${log.unit ? ` ${log.unit}` : ''}` : ''}`,
    log.target ? `trị ${log.target}` : null,
    log.withholding_days ? `cách ly ${log.withholding_days} ngày` : null,
    log.worker ? `người làm: ${log.worker}` : null,
    log.note,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Nhật ký 1 vườn trong khoảng ngày (cũ trước), dạng chữ để gửi Zalo / in */
export function farmLogText(garden: Pick<Garden, 'name' | 'crop' | 'area_m2'>, logs: FarmLog[], range: { from?: string; to?: string } = {}): string {
  const rows = logs
    .filter((l) => !l.deleted_at && (!range.from || l.date >= range.from) && (!range.to || l.date <= range.to))
    .sort((a, b) => a.date.localeCompare(b.date) || a.updated_at.localeCompare(b.updated_at));
  const head = [`NHẬT KÝ CANH TÁC: ${garden.name}`, garden.crop ? `Cây trồng: ${garden.crop}` : null, garden.area_m2 ? `Diện tích: ${formatQtyGrouped(garden.area_m2)} m²` : null]
    .filter(Boolean)
    .join('\n');
  const period = range.from || range.to ? `Từ ${range.from ? formatDate(range.from) : '…'} đến ${range.to ? formatDate(range.to) : '…'}` : null;
  const body = rows.length ? rows.map((l, i) => `${i + 1}. ${farmLogLine(l)}`).join('\n') : 'Chưa ghi việc nào.';
  return [head, period, '', body].filter((x) => x !== null).join('\n');
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
