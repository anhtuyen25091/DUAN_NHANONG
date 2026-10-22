import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import { PurchaseOutbox } from './outbox';
import type { Purchase, PurchaseInput } from './trade';

const input: PurchaseInput = { customer_name: 'Chú Năm', date: '2026-10-22', lines: [{ product_code: 'ca-phe-robusta', name: 'Cà phê', kg: 500, price: 93000 }] };

function setup(savePurchase: (token: string, input: PurchaseInput) => Promise<Purchase>, userId = 1) {
  let stored: string | null = null;
  const auth = { current: { token: 't', user: { id: userId } } as { token: string; user: { id: number } } | null };
  const outbox = new PurchaseOutbox({ savePurchase }, { getAuth: () => auth.current, load: () => stored, save: (v) => (stored = v) });
  return { outbox, auth, stored: () => stored };
}

describe('PurchaseOutbox', () => {
  it('lưu phiếu trên máy, có mạng thì gửi kèm uuid rồi bỏ khỏi hàng chờ', async () => {
    const save = vi.fn(async (_t: string, i: PurchaseInput) => ({ id: i.uuid, code: 'PM-000001' }) as Purchase);
    const { outbox, stored } = setup(save);
    const item = outbox.add(input);
    expect(JSON.parse(stored()!)).toHaveLength(1);

    const sent = await outbox.flush();
    expect(save).toHaveBeenCalledWith('t', { ...input, kind: 'buy', uuid: item.id });
    expect(sent.map((p) => p.code)).toEqual(['PM-000001']);
    expect(outbox.mine()).toEqual([]);
  });

  it('mất mạng thì dừng và giữ phiếu; máy chủ từ chối thì ghi lý do, gửi tiếp phiếu sau', async () => {
    const offline = setup(async () => {
      throw new ApiError('Không kết nối được máy chủ.', 0);
    });
    offline.outbox.add(input);
    await offline.outbox.flush();
    expect(offline.outbox.mine()[0].error).toBeNull();

    let call = 0;
    const rejected = setup(async (_t, i) => {
      call++;
      if (call === 1) throw new ApiError('Lỗi', 422, { lines: ['Vượt giá chủ chốt'] });
      return { id: i.uuid, code: 'PM-000002' } as Purchase;
    });
    rejected.outbox.add(input);
    rejected.outbox.add(input);
    await rejected.outbox.flush();
    expect(rejected.outbox.mine()).toHaveLength(1);
    expect(rejected.outbox.mine()[0].error).toBe('Vượt giá chủ chốt');
    // Phiếu bị từ chối chỉ gửi lại khi người dùng bấm thử lại
    await rejected.outbox.flush();
    expect(call).toBe(2);
  });

  it('chỉ gửi phiếu của tài khoản đang đăng nhập', async () => {
    const save = vi.fn(async () => ({}) as Purchase);
    const { outbox, auth } = setup(save);
    outbox.add(input);
    auth.current = { token: 'other', user: { id: 2 } };
    expect(outbox.mine()).toEqual([]);
    await outbox.flush();
    expect(save).not.toHaveBeenCalled();
  });
});
