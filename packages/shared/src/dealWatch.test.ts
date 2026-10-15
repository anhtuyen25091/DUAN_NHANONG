import { describe, expect, it } from 'vitest';
import type { Deal } from './api';
import { DealWatcher } from './dealWatch';

const deal = (patch: Partial<Deal> & { uuid: string }): Deal =>
  ({ title: 'Sầu riêng Ri6', status: 'open', summary: { awaiting_me: 0 }, last_activity: null, updated_at: '2026-10-15T08:00:00+07:00', ...patch }) as Deal;

function setup(responses: Deal[][], seen: Record<string, string> = {}) {
  const calls: Array<string | undefined> = [];
  let store = seen;
  const watcher = new DealWatcher(
    {
      deals: async (_token: string, since?: string) => {
        calls.push(since);
        return responses.shift() ?? [];
      },
    },
    { getToken: () => 'tok', loadSeen: () => store, saveSeen: (s) => (store = s) },
  );
  return { watcher, calls, seen: () => store };
}

describe('DealWatcher', () => {
  it('lần đầu trên máy: ghi nhận, không báo dồn việc cũ; sau đó báo việc bên kia vừa làm', async () => {
    const a = deal({ uuid: 'a', summary: { awaiting_me: 1 } as Deal['summary'], last_activity: { text: 'Chú Ba ghi Cọc 100.000.000 đ, chờ xác nhận', by_me: false, at: '2026-10-15T08:00:00+07:00' } });
    const later = deal({
      uuid: 'a',
      updated_at: '2026-10-15T08:05:00+07:00',
      summary: { awaiting_me: 2 } as Deal['summary'],
      last_activity: { text: 'Chú Ba ghi Đợt cân 120.000.000 đ (1.500 kg), chờ xác nhận', by_me: false, at: '2026-10-15T08:05:00+07:00' },
    });
    const { watcher, calls } = setup([[a], [later]]);
    const changed: string[] = [];
    watcher.onDealChanged((uuid) => changed.push(uuid));

    await watcher.poll();
    expect(watcher.getState()).toEqual({ awaiting: 1, notices: [] });

    await watcher.poll();
    expect(calls).toEqual([undefined, '2026-10-15T08:00:00+07:00']);
    expect(watcher.getState().awaiting).toBe(2);
    expect(watcher.getState().notices.map((n) => n.text)).toEqual(['Chú Ba ghi Đợt cân 120.000.000 đ (1.500 kg), chờ xác nhận']);
    expect(changed).toEqual(['a']);

    watcher.dismiss(watcher.getState().notices[0].id);
    expect(watcher.getState().notices).toEqual([]);
  });

  it('việc do chính mình làm thì không báo; việc đã xem (máy đã lưu) thì không báo lại', async () => {
    const mine = deal({ uuid: 'b', last_activity: { text: 'Lái Tư ghi Trả tiền', by_me: true, at: '2026-10-15T09:00:00+07:00' } });
    const seenBefore = deal({ uuid: 'c', last_activity: { text: 'Chú Ba đồng ý Cọc', by_me: false, at: '2026-10-15T07:00:00+07:00' } });
    const fresh = deal({ uuid: 'd', last_activity: { text: 'Chi nhánh đã tham gia đơn', by_me: false, at: '2026-10-15T09:30:00+07:00' } });
    const { watcher, seen } = setup([[mine, seenBefore, fresh]], { c: '2026-10-15T07:00:00+07:00' });

    await watcher.poll();
    expect(watcher.getState().notices.map((n) => n.dealUuid)).toEqual(['d']);
    expect(seen()).toEqual({ b: '2026-10-15T09:00:00+07:00', c: '2026-10-15T07:00:00+07:00', d: '2026-10-15T09:30:00+07:00' });
  });

  it('đơn đã kết thúc không tính vào số chờ xác nhận; chưa đăng nhập thì không hỏi server', async () => {
    const { watcher } = setup([[deal({ uuid: 'e', status: 'done', summary: { awaiting_me: 3 } as Deal['summary'] })]]);
    await watcher.poll();
    expect(watcher.getState().awaiting).toBe(0);

    const idle = new DealWatcher({ deals: async () => { throw new Error('không được gọi'); } }, { getToken: () => null, loadSeen: () => ({}), saveSeen: () => {} });
    await expect(idle.poll()).resolves.toEqual([]);
  });
});
