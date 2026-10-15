import { dueReminders, formatDateLong, today, type Ledger, type LedgerSnapshot } from '@nhanong/shared';
import Storage from 'expo-sqlite/kv-store';
import { AppState, Platform } from 'react-native';
import { notifications, notificationsUnsupported } from './push';

/**
 * Nhắc hạn trả nợ bằng thông báo trên máy (không cần mạng, không qua server):
 * mỗi kỳ trả nợ vay / hẹn trả nợ trong 60 ngày tới → 1 thông báo 8 giờ sáng hôm trước + 1 thông báo 7 giờ sáng đúng ngày.
 * Chỉ hỏi quyền thông báo khi người dùng bật trong Cài đặt sổ.
 */

const PREF_KEY = 'due_reminders';
const ID_PREFIX = 'due:';
const CHANNEL = 'due-reminders';
const DAYS_AHEAD = 60;
/** iOS chỉ giữ 64 thông báo hẹn giờ của mỗi app: chừa chỗ, lấy các thông báo gần nhất */
const MAX_SCHEDULED = 60;

export type ReminderResult = { ok: true } | { ok: false; reason: string };

/** Lý do máy này không đặt được thông báo nhắc (null = được) */
export const remindersUnsupported = notificationsUnsupported;

export function dueRemindersEnabled(): boolean {
  if (remindersUnsupported) return false;
  try {
    return Storage.getItemSync(PREF_KEY) === '1';
  } catch {
    return false;
  }
}

function setPref(on: boolean) {
  try {
    Storage.setItemSync(PREF_KEY, on ? '1' : '0');
  } catch {
    // không lưu được thì lần mở app sau coi như tắt
  }
}

interface Planned {
  identifier: string;
  at: Date;
  title: string;
  body: string;
  debtId: string;
}

/** "2026-10-20" + lệch ngày + giờ → Date giờ địa phương */
function localTime(date: string, dayOffset: number, hour: number): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d + dayOffset, hour, 0, 0);
}

/** Các thông báo cần đặt (đã bỏ giờ đã qua), sắp theo thời gian */
export function plannedNotifications(data: Pick<LedgerSnapshot, 'debts' | 'debt_payments'>, now = new Date()): Planned[] {
  const list: Planned[] = [];
  for (const r of dueReminders(data, today(now), DAYS_AHEAD)) {
    if (r.overdue) continue;
    const verb = r.debt.kind === 'receivable' ? 'thu nợ' : 'trả nợ';
    const body = `${r.title} · ${formatDateLong(r.due)}`;
    const slots: Array<[string, Date, string]> = [
      ['before', localTime(r.due, -1, 8), `🔔 Sắp đến hạn ${verb}`],
      ['day', localTime(r.due, 0, 7), '🔔 Hôm nay đến hạn'],
    ];
    for (const [slot, at, title] of slots) {
      if (at.getTime() <= now.getTime()) continue;
      list.push({ identifier: `${ID_PREFIX}${r.key}:${slot}`, at, title, body, debtId: r.debt.id });
    }
  }
  return list.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX_SCHEDULED);
}

/** Dấu vết lần đặt gần nhất: dữ liệu đổi mà lịch nhắc không đổi thì khỏi đặt lại */
let lastSignature: string | null = null;
let queue: Promise<unknown> = Promise.resolve();

async function cancelOurs(N: NonNullable<ReturnType<typeof notifications>>) {
  const scheduled = await N.getAllScheduledNotificationsAsync();
  await Promise.all(scheduled.filter((n) => n.identifier.startsWith(ID_PREFIX)).map((n) => N.cancelScheduledNotificationAsync(n.identifier)));
}

/**
 * Đặt lại toàn bộ thông báo nhắc hạn của app theo sổ hiện tại.
 * Không làm gì khi máy không hỗ trợ / chưa bật / chưa cho phép thông báo (không tự hỏi quyền).
 */
export function syncDueNotifications(data: Pick<LedgerSnapshot, 'debts' | 'debt_payments'>): Promise<void> {
  const run = async () => {
    const N = notifications();
    if (!N) return;
    if (!dueRemindersEnabled()) {
      if (lastSignature !== 'off') await cancelOurs(N);
      lastSignature = 'off';
      return;
    }
    if ((await N.getPermissionsAsync()).status !== 'granted') return;
    const planned = plannedNotifications(data);
    const signature = planned.map((p) => `${p.identifier}@${p.at.getTime()}|${p.body}`).join('\n');
    if (signature === lastSignature) return;

    if (Platform.OS === 'android') {
      await N.setNotificationChannelAsync(CHANNEL, { name: 'Nhắc hạn trả nợ', importance: N.AndroidImportance.HIGH, vibrationPattern: [0, 250, 250, 250] });
    }
    await cancelOurs(N);
    for (const p of planned) {
      await N.scheduleNotificationAsync({
        identifier: p.identifier,
        content: { title: p.title, body: p.body, data: { debtId: p.debtId } },
        trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: p.at, channelId: CHANNEL },
      });
    }
    lastSignature = signature;
  };
  // Chạy lần lượt để 2 lần đặt không chen nhau
  const next = queue.then(run, run);
  queue = next.catch(() => {});
  return next;
}

/** Bật nhắc hạn: hỏi quyền thông báo (lúc này mới hỏi) rồi đặt lịch */
export async function enableDueReminders(data: Pick<LedgerSnapshot, 'debts' | 'debt_payments'>): Promise<ReminderResult> {
  const N = notifications();
  if (!N) return { ok: false, reason: remindersUnsupported ?? 'Máy này không hỗ trợ thông báo.' };
  let { status } = await N.getPermissionsAsync();
  if (status !== 'granted') status = (await N.requestPermissionsAsync()).status;
  if (status !== 'granted') return { ok: false, reason: 'Chưa cho phép thông báo. Vào Cài đặt của máy để bật thông báo cho Nhà Nông.' };
  setPref(true);
  lastSignature = null;
  await syncDueNotifications(data);
  return { ok: true };
}

/** Tắt nhắc hạn: hủy các thông báo đã đặt */
export async function disableDueReminders(data: Pick<LedgerSnapshot, 'debts' | 'debt_payments'>): Promise<void> {
  setPref(false);
  await syncDueNotifications(data);
}

let started = false;

/**
 * Gọi 1 lần sau khi mở sổ: đặt lại thông báo lúc mở app, khi sổ thay đổi (chờ 2 giây cho gộp nhiều lần ghi)
 * và khi quay lại app (qua ngày mới thì bỏ các nhắc đã qua).
 */
export function startDueReminders(ledger: Ledger) {
  if (started || remindersUnsupported) return;
  started = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = (delay: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      syncDueNotifications(ledger.getSnapshot()).catch(() => {});
    }, delay);
  };
  schedule(1500);
  ledger.subscribe(() => schedule(2000));
  AppState.addEventListener('change', (state) => {
    if (state === 'active') schedule(1000);
  });
}
