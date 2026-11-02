/**
 * Việc làm vườn dùng chung giữa Sổ thu chi (Nhật ký canh tác của vườn) và cảm biến (việc trên lô):
 * - lô nối với 1 vườn trong sổ (plot.ledger_garden_id); 1 vườn nối được nhiều lô
 * - 1 việc = 1 nhật ký cùng id (uuid); vườn nhiều lô thì mỗi lô 1 việc cùng uuid
 * - máy của chủ trang trại đồng bộ 2 chiều: việc mới / sửa / xóa trên lô (kể cả máy bơm tự ghi tưới, người làm công ghi)
 *   → nhật ký trong sổ; nhật ký mới / sửa / xóa trong sổ → việc trên lô (để cấm vào lô, tạm dừng tưới trên tán, báo mọi người)
 * Việc đã lên kế hoạch (chưa làm) chỉ nằm trên máy chủ cảm biến, làm xong mới vào sổ.
 */
import { formatDate } from './format';
import type { IotApi, IotPlot, IotPlotEvent, IotPlotEventInput, IotWorkKind, IotWorkStatus } from './iot';
import { FARM_LOG_SYNC_FIELDS, today, type Ledger, type NewFarmLog } from './ledger';
import type { FarmLog } from './types';

export interface FarmWorkLink {
  plot_id: number;
  garden_id: string;
}

export interface FarmWorkSyncPlan {
  /** Thêm / sửa nhật ký trong sổ (id = uuid của việc) */
  upsertLogs: Array<{ id: string; input: NewFarmLog }>;
  /** Việc đã xóa trên lô: xóa nhật ký */
  removeLogs: string[];
  /** Gửi nhật ký lên lô (thêm hoặc sửa theo uuid) */
  pushEvents: Array<{ plot_id: number; input: IotPlotEventInput }>;
  /** Nhật ký đã xóa trong sổ: xóa việc trên lô */
  deleteEvents: Array<{ plot_id: number; uuid: string }>;
}

/** Nhật ký cũ hơn ngần này không gửi lên lô ở lần nối đầu tiên */
export const FARM_WORK_FIRST_SYNC_DAYS = 180;

/** Nhật ký trong sổ ứng với 1 việc trên lô */
export function farmLogInputFromEvent(event: IotPlotEvent, gardenId: string): NewFarmLog {
  return {
    garden_id: gardenId,
    // Máy chủ cảm biến trả giờ Việt Nam (+07:00): 10 ký tự đầu là ngày
    date: event.done_at.slice(0, 10),
    kind: event.kind,
    title: event.title,
    quantity: event.quantity,
    unit: event.unit,
    target: event.target,
    withholding_days: event.withholding_days,
    worker: event.worker ?? (event.source === 'actuator' ? null : (event.user?.name ?? null)),
    note: event.note,
  };
}

/**
 * Việc trên lô ứng với 1 nhật ký. Giờ làm: giữ giờ cũ nếu cùng ngày; nhật ký hôm nay chưa có trên lô thì lấy lúc ghi
 * (để tính đúng giờ cấm vào lô / chờ thuốc khô); ngày khác thì 12:00.
 */
export function eventInputFromLog(log: FarmLog, known?: IotPlotEvent, nowDate = today()): IotPlotEventInput {
  const doneAt = known && known.done_at.slice(0, 10) === log.date ? known.done_at : log.date === nowDate ? log.updated_at : `${log.date}T12:00:00+07:00`;
  return {
    uuid: log.id,
    kind: log.kind as IotWorkKind,
    title: log.title,
    quantity: log.quantity,
    unit: log.unit,
    target: log.target,
    withholding_days: log.withholding_days,
    // Cấm vào lô / chờ thuốc khô chỉ có trên lô: không ghi đè khi sửa từ sổ
    reentry_hours: known?.reentry_hours ?? null,
    rain_free_hours: known?.rain_free_hours ?? null,
    worker: log.worker,
    note: log.note,
    planned: false,
    done_at: doneAt,
    source: 'ledger',
  };
}

function sameContent(log: FarmLog, input: NewFarmLog): boolean {
  return FARM_LOG_SYNC_FIELDS.every((key) => {
    const a = log[key] ?? null;
    const b = (input as unknown as Record<string, unknown>)[key] ?? null;
    return a === b;
  });
}

/**
 * Tính việc cần làm để 2 bên khớp nhau.
 * @param events việc trên các lô đã nối, sửa từ lần đồng bộ trước (kể cả đã xóa)
 * @param logs mọi nhật ký trong sổ, kể cả đã xóa
 * @param lastSync lần đồng bộ trước theo lô (ISO); chưa có = lần đầu
 */
export function planFarmWorkSync(input: {
  links: FarmWorkLink[];
  events: Record<number, IotPlotEvent[]>;
  logs: FarmLog[];
  lastSync: Record<number, string | undefined>;
  now?: Date;
}): FarmWorkSyncPlan {
  const plan: FarmWorkSyncPlan = { upsertLogs: [], removeLogs: [], pushEvents: [], deleteEvents: [] };
  const logsById = new Map(input.logs.map((l) => [l.id, l]));
  const now = input.now ?? new Date();
  const todayDate = today(now);
  const firstFrom = new Date(now.getTime() - FARM_WORK_FIRST_SYNC_DAYS * 86400000).toISOString().slice(0, 10);
  const upserted = new Set<string>();
  const removed = new Set<string>();

  for (const link of input.links) {
    const events = input.events[link.plot_id] ?? [];
    const eventsByUuid = new Map(events.map((e) => [e.uuid, e]));

    // Lô → sổ
    for (const event of events) {
      if (event.planned) continue;
      const log = logsById.get(event.uuid);
      if (event.deleted) {
        if (log && !log.deleted_at && !removed.has(log.id)) {
          plan.removeLogs.push(log.id);
          removed.add(log.id);
        }
        continue;
      }
      if (log?.deleted_at) {
        // Đã xóa trong sổ: xóa luôn trên lô
        plan.deleteEvents.push({ plot_id: link.plot_id, uuid: event.uuid });
        continue;
      }
      const wanted = farmLogInputFromEvent(event, log?.garden_id ?? link.garden_id);
      if (upserted.has(event.uuid)) continue;
      // Sổ sửa sau lô thì giữ bản trong sổ (sẽ gửi lên bên dưới)
      if (log && (sameContent(log, wanted) || (event.updated_at !== null && log.updated_at > event.updated_at))) continue;
      plan.upsertLogs.push({ id: event.uuid, input: wanted });
      upserted.add(event.uuid);
    }

    // Sổ → lô
    const since = input.lastSync[link.plot_id];
    for (const log of input.logs) {
      if (log.garden_id !== link.garden_id) continue;
      if (since ? log.updated_at <= since : log.deleted_at !== null || log.date < firstFrom) continue;
      if (log.deleted_at) {
        if (!removed.has(log.id)) plan.deleteEvents.push({ plot_id: link.plot_id, uuid: log.id });
        continue;
      }
      if (upserted.has(log.id)) continue;
      const known = eventsByUuid.get(log.id);
      // Lô đã có đúng nội dung (VD vừa nhận từ lô ở trên) thì thôi
      if (known && !known.deleted && sameContent(log, farmLogInputFromEvent(known, log.garden_id))) continue;
      if (known?.deleted) continue;
      plan.pushEvents.push({ plot_id: link.plot_id, input: eventInputFromLog(log, known, todayDate) });
    }
  }

  return plan;
}

export interface FarmWorkSyncStore {
  get(): Record<number, string>;
  set(value: Record<number, string>): void;
}

/**
 * Đồng bộ 1 lượt (gọi khi mở mục Cảm biến / trang lô / Nhật ký canh tác, sau khi ghi nhật ký).
 * Chỉ các lô của trang trại mình (chủ) đã nối với vườn có trong sổ trên máy này.
 * @return số thay đổi đã làm
 */
export async function runFarmWorkSync(iot: IotApi, ledger: Ledger, store: FarmWorkSyncStore, now = new Date()): Promise<number> {
  const gardens = new Set(ledger.getSnapshot().gardens.map((g) => g.id));
  const farms = await iot.farms();
  // Chỉ chủ trang trại: vườn nằm trong sổ của chủ
  const plots: IotPlot[] = farms.filter((f) => f.role === 'owner').flatMap((f) => f.plots ?? []);
  const links = plots.filter((p) => p.ledger_garden_id && gardens.has(p.ledger_garden_id)).map((p) => ({ plot_id: p.id, garden_id: p.ledger_garden_id as string }));
  if (links.length === 0) return 0;

  const lastSync = store.get();
  // Lùi 1 phút: đồng hồ máy và máy chủ lệch nhau một chút
  const startedAt = new Date(now.getTime() - 60000).toISOString();
  const events: Record<number, IotPlotEvent[]> = {};
  for (const link of links) {
    events[link.plot_id] = await iot.plotEvents(link.plot_id, { since: lastSync[link.plot_id] ?? '2000-01-01T00:00:00Z' });
  }

  const plan = planFarmWorkSync({ links, events, logs: ledger.farmLogsWithDeleted(), lastSync, now });
  let changes = 0;
  for (const { id, input } of plan.upsertLogs) {
    if (gardens.has(input.garden_id) && (await ledger.upsertFarmLogFromIot(id, input))) changes++;
  }
  for (const id of plan.removeLogs) {
    await ledger.removeFarmLog(id);
    changes++;
  }
  for (const { plot_id, input } of plan.pushEvents) {
    await iot.savePlotEvent(plot_id, input);
    changes++;
  }
  for (const { plot_id, uuid } of plan.deleteEvents) {
    await iot.deletePlotEventByUuid(plot_id, uuid);
    changes++;
  }

  store.set({ ...lastSync, ...Object.fromEntries(links.map((l) => [l.plot_id, startedAt])) });
  return changes;
}

/** Các dòng cảnh báo của lô từ việc đã làm: "⛔ Không vào lô tới 08:00 03/11 (phun Regent)" */
export function workStatusLines(work: IotWorkStatus | undefined, now = new Date()): Array<{ level: 'danger' | 'warn' | 'info'; text: string }> {
  if (!work) return [];
  const time = (iso: string) => {
    const d = new Date(iso);
    const vn = new Date(d.getTime() + 7 * 3600000);
    return `${String(vn.getUTCHours()).padStart(2, '0')}:${String(vn.getUTCMinutes()).padStart(2, '0')} ${formatDate(vn.toISOString().slice(0, 10), true)}`;
  };
  const lines: Array<{ level: 'danger' | 'warn' | 'info'; text: string }> = [];
  if (work.no_entry_until && new Date(work.no_entry_until) > now) {
    lines.push({ level: 'danger', text: `⛔ Không vào lô tới ${time(work.no_entry_until)} (vừa phun ${work.no_entry_event?.title ?? 'thuốc'})` });
  }
  if (work.harvest_from) {
    lines.push({ level: 'danger', text: `🚫 Chưa thu hoạch: cách ly tới hết ngày ${formatDate(addDaysIso(work.harvest_from, -1))}, thu hoạch từ ${formatDate(work.harvest_from)} (${work.harvest_event?.title ?? 'thuốc BVTV'})` });
  }
  if (work.canopy_paused_until && new Date(work.canopy_paused_until) > now) {
    lines.push({ level: 'warn', text: `💧 Tạm dừng tưới trên tán tới ${time(work.canopy_paused_until)} cho thuốc khô` });
  }
  if (work.fertilized_at) {
    lines.push({ level: 'info', text: `🌱 Vừa bón ${work.fertilize_event?.title ?? 'phân'} ngày ${formatDate(work.fertilized_at.slice(0, 10), true)}: EC, đạm, lân, kali có thể tăng vài ngày` });
  }
  return lines;
}

function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Thời gian cách ly / cấm vào lô hay gặp trên nhãn thuốc, để chọn nhanh (người dùng nhập theo nhãn) */
export const REENTRY_PRESETS = [4, 12, 24, 48];
export const RAIN_FREE_PRESETS = [2, 4, 6, 12];
