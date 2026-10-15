import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApi, randomUuid } from './api';

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(status === 204 ? null : JSON.stringify(body), { status }));
}

describe('createApi', () => {
  it('ghép query, bỏ tham số rỗng', async () => {
    const fetch = fakeFetch(200, { data: [], date: '2026-10-14' });
    const api = createApi({ baseUrl: 'http://x/', fetch });

    await api.prices({ type: 'nong_san', region: '' });

    expect(fetch.mock.calls[0][0]).toBe('http://x/api/v1/prices?type=nong_san');
  });

  it('gửi X-Device-Id cho API cảnh báo', async () => {
    const fetch = fakeFetch(201, { data: { id: 1 } });
    const api = createApi({ baseUrl: 'http://x', fetch, getDeviceId: () => 'uuid-1' });

    await api.createAlert({ product: 'ho-tieu', region: null, condition: 'change', threshold: null });

    const init = fetch.mock.calls[0][1]!;
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['X-Device-Id']).toBe('uuid-1');
    expect(JSON.parse(init.body as string)).toMatchObject({ product: 'ho-tieu', condition: 'change' });
  });

  it('báo lỗi kèm thông báo của server', async () => {
    const api = createApi({ baseUrl: 'http://x', fetch: fakeFetch(422, { message: 'Sai', errors: { threshold: ['Bắt buộc'] } }), getDeviceId: () => 'u' });

    const error = await api.createAlert({ product: 'x', region: null, condition: 'above', threshold: null }).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(422);
    expect(error.errors.threshold).toEqual(['Bắt buộc']);
  });

  it('xóa trả 204', async () => {
    const api = createApi({ baseUrl: 'http://x', fetch: fakeFetch(204, null), getDeviceId: () => 'u' });
    await expect(api.deleteAlert(3)).resolves.toBeUndefined();
  });
});

describe('randomUuid', () => {
  it('đúng định dạng uuid v4', () => {
    expect(randomUuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('API điểm bán', () => {
  it('tìm quanh vị trí', async () => {
    const fetch = fakeFetch(200, { data: [], meta: { page: 1, has_more: false, total: 0 } });
    const api = createApi({ baseUrl: 'http://x', fetch });

    await api.shops({ type: 'phan_bon', lat: 12.5, lng: 108, radius: 20 });

    expect(fetch.mock.calls[0][0]).toBe('http://x/api/v1/shops?type=phan_bon&lat=12.5&lng=108&radius=20');
  });

  it('gửi đề xuất kèm X-Device-Id, trả lời cảm ơn', async () => {
    const fetch = fakeFetch(201, { message: 'Cảm ơn bạn!' });
    const api = createApi({ baseUrl: 'http://x', fetch, getDeviceId: () => 'u' });

    await expect(api.submitShop({ name: 'Đại lý A', types: ['thu_mua'] })).resolves.toBe('Cảm ơn bạn!');
    expect((fetch.mock.calls[0][1]!.headers as Record<string, string>)['X-Device-Id']).toBe('u');
  });
});
