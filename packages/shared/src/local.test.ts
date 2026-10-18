import { describe, expect, it } from 'vitest';
import { compareToReference, describeLocation, nearestProvince, placeLabel, provinceLocation, radiusToReach } from './local';

describe('khu vực của tôi', () => {
  it('trung tâm tỉnh khi không có GPS; đoán tỉnh từ tọa độ', () => {
    expect(provinceLocation('dak-lak', 20, 'Đắk Lắk')).toMatchObject({ lat: 12.6667, lng: 108.05, radius: 20, gps: false });
    expect(provinceLocation('khong-co')).toBeNull();
    expect(nearestProvince(12.7, 108.1)).toBe('dak-lak');
    expect(nearestProvince(10.03, 105.78)).toBe('can-tho');
  });

  it('mô tả khu vực', () => {
    expect(describeLocation({ province: 'dak-lak', province_name: 'Đắk Lắk', lat: 0, lng: 0, label: 'Xã Hòa Thuận', radius: 30, gps: true })).toBe('Xã Hòa Thuận, Đắk Lắk · 30 km');
    expect(describeLocation({ province: 'dak-lak', province_name: 'Đắk Lắk', lat: 0, lng: 0, label: null, radius: 30, gps: true })).toBe('Vị trí của tôi, Đắk Lắk · 30 km');
    // Tên tự gõ mà không có tọa độ thật: vẫn tìm quanh trung tâm tỉnh, nên ghi đúng như vậy
    expect(describeLocation({ province: 'dak-lak', province_name: 'Đắk Lắk', lat: 0, lng: 0, label: 'buôn hồ', radius: 10, gps: false })).toBe('Trung tâm Đắk Lắk · 10 km');
    expect(describeLocation({ province: 'dak-lak', province_name: 'Đắk Lắk', lat: 0, lng: 0, label: null, radius: 20 })).toBe('Trung tâm Đắk Lắk · 20 km');
  });
});

describe('so với giá chung', () => {
  it('nông sản: cao hơn là tốt cho người bán; phân thuốc: thấp hơn là tốt cho người mua', () => {
    expect(compareToReference(95000, 93000, 'nong_san')).toEqual({ diff: 2000, percent: 2.2, good: true });
    expect(compareToReference(93300, 93000, 'nong_san')?.percent).toBe(0.3);
    expect(compareToReference(500000, 520000, 'phan_bon')).toMatchObject({ diff: -20000, good: true });
    expect(compareToReference(540000, 520000, 'phan_bon')).toMatchObject({ good: false });
    expect(compareToReference(1, null, 'nong_san')).toBeNull();
  });
});

describe('radiusToReach / placeLabel', () => {
  it('chọn bán kính nhỏ nhất đủ tới điểm mua gần nhất', () => {
    expect(radiusToReach(12.9)).toBe(20);
    expect(radiusToReach(20)).toBe(20);
    expect(radiusToReach(23)).toBe(30);
    expect(radiusToReach(64)).toBeNull();
  });

  it('ghi kèm xã / phường khi khác tên địa danh', () => {
    const place = { name: 'Thôn Hòa Thuận', detail: 'Xã Hòa Phú', province: 'dak-lak', province_name: 'Đắk Lắk', lat: 12.7, lng: 108.1 };
    expect(placeLabel(place)).toBe('Thôn Hòa Thuận (Xã Hòa Phú)');
    expect(placeLabel({ ...place, name: 'Phường Buôn Hồ', detail: null })).toBe('Phường Buôn Hồ');
  });
});

describe('bản đồ Việt Nam', () => {
  it('khung bản đồ chứa Hoàng Sa, Trường Sa và mọi tỉnh; có nhãn chủ quyền', async () => {
    const { VIETNAM_BOUNDS, MAP_LABELS } = await import('./map');
    const { PROVINCE_CENTERS, PROVINCE_NAMES } = await import('./local');
    const inside = ([lat, lng]: [number, number]) => lat >= VIETNAM_BOUNDS[0][0] && lat <= VIETNAM_BOUNDS[1][0] && lng >= VIETNAM_BOUNDS[0][1] && lng <= VIETNAM_BOUNDS[1][1];
    // Hoàng Sa (đảo Phú Lâm, đảo Tri Tôn), Trường Sa (đảo Trường Sa Lớn, đá Vành Khăn, đá An Bang) và mũi Cà Mau
    for (const point of [[16.83, 112.33], [15.78, 111.2], [8.64, 111.92], [9.9, 115.53], [7.88, 112.92], [8.6, 104.72]] as [number, number][]) {
      expect(inside(point)).toBe(true);
    }
    for (const center of Object.values(PROVINCE_CENTERS)) expect(inside(center)).toBe(true);
    expect(Object.keys(PROVINCE_NAMES).sort()).toEqual(Object.keys(PROVINCE_CENTERS).sort());
    expect(MAP_LABELS.filter((l) => l.kind === 'sovereignty').map((l) => l.text)).toEqual(['Quần đảo Hoàng Sa (Việt Nam)', 'Quần đảo Trường Sa (Việt Nam)']);
  });
});

describe('dàn điểm gần đúng', () => {
  it('giữ nguyên điểm đúng nhà, dàn điểm tâm xã trong 600 m, cố định theo id', async () => {
    const { spreadPoint } = await import('./map');
    // Khoảng cách xấp xỉ (m) đủ dùng cho vài trăm mét
    const meters = (a: number[], b: number[]) => Math.hypot((a[0] - b[0]) * 111_320, (a[1] - b[1]) * 111_320 * Math.cos((a[0] * Math.PI) / 180));
    expect(spreadPoint(18.3, 105.9, 1, 'exact')).toEqual([18.3, 105.9]);
    const a = spreadPoint(18.3, 105.9, 42, 'place');
    expect(a).toEqual(spreadPoint(18.3, 105.9, 42, 'place'));
    expect(a).not.toEqual(spreadPoint(18.3, 105.9, 43, 'place'));
    expect(meters([18.3, 105.9], a)).toBeLessThanOrEqual(601);
    expect(meters([18.3, 105.9], a)).toBeGreaterThanOrEqual(149);
  });
});

describe('ảnh hóa đơn', () => {
  it('chỉ gửi ảnh đang dùng chưa gửi, tải ảnh đang dùng máy chưa có', async () => {
    const { photosToSync, fitSize } = await import('./receipts');
    const t = (id: string, photo: string | null, deleted = false) => ({ id, photo_id: photo, deleted_at: deleted ? '2026-01-01' : null }) as never;
    const snapshot = { transactions: [t('1', 'a'), t('2', 'b'), t('3', 'c'), t('4', 'd', true), t('5', null)] };
    const result = photosToSync(snapshot, { has: new Set(['a', 'b', 'd', 'x']), uploaded: new Set(['a']) });
    expect(result.upload).toEqual(['b']);
    expect(result.download).toEqual(['c']);
    expect(fitSize(4000, 3000)).toEqual({ width: 1280, height: 960 });
    expect(fitSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('ảnh thừa: chỉ xóa ảnh không khoản nào dùng, sau 1 ngày (còn kịp hoàn tác, ảnh chưa lưu khoản)', async () => {
    const { orphanPhotos, PHOTO_GRACE_MS } = await import('./receipts');
    const now = Date.parse('2026-10-18T10:00:00Z');
    const t = (photo: string, deletedAt: string | null = null) => ({ id: photo, photo_id: photo, deleted_at: deletedAt }) as never;
    const snapshot = {
      transactions: [
        t('dung'), // khoản còn
        t('xoa-hom-qua', '2026-10-16T09:00:00Z'), // xóa quá 1 ngày → xóa ảnh
        t('xoa-vua-xong', '2026-10-18T09:59:00Z'), // còn hoàn tác được → giữ
      ],
    };
    const old = now - PHOTO_GRACE_MS - 1;
    const local = [
      { id: 'dung', savedAt: old },
      { id: 'xoa-hom-qua', savedAt: old },
      { id: 'xoa-vua-xong', savedAt: old },
      { id: 'anh-da-thay', savedAt: old }, // khoản đã thay ảnh khác → xóa
      { id: 'anh-cu-khong-ro-ngay', savedAt: null }, // ảnh cũ không rõ ngày lưu → xóa
      { id: 'vua-chup-chua-luu', savedAt: now - 60_000 }, // đang ở màn ghi tiền → giữ
    ];
    expect(orphanPhotos(snapshot, local, now)).toEqual(['xoa-hom-qua', 'anh-da-thay', 'anh-cu-khong-ro-ngay']);
  });
});

describe('link mã đơn / phiếu', () => {
  it('link mở app và link web', async () => {
    const { appJoinLink, webJoinLink } = await import('./business');
    expect(appJoinLink('NN7K3P')).toBe('nhanong://deals/join?code=NN7K3P');
    expect(webJoinLink('https://nhanong.vn/', 'NN7K3P')).toBe('https://nhanong.vn/#/don/tham-gia?ma=NN7K3P');
  });
});

describe('cập nhật tức thì', () => {
  it('không bật thì không kết nối; bật thì nghe đúng kênh, báo trạng thái, đổi tài khoản thì ngắt', async () => {
    const { RealtimeLink } = await import('./realtime');
    let token: string | null = 't1';
    const events: string[] = [];
    let stateListener: ((c: { current: string }) => void) | null = null;
    let messageListener: ((m: { data?: unknown }) => void) | null = null;
    let closed = 0;
    let enabled = false;
    const link = new RealtimeLink({
      api: { realtimeToken: async () => (enabled ? { enabled: true, channel: 'user:7', token_request: { mac: 'x' } } : { enabled: false }) },
      getToken: () => token,
      createClient: (auth) => {
        auth(null, (_e, tr) => events.push(`vé ${tr?.mac}`));
        return {
          connection: { state: 'initialized', on: (l) => (stateListener = l) },
          channels: { get: (name) => ({ subscribe: (l) => { events.push(`nghe ${name}`); messageListener = l; } }) },
          close: () => closed++,
        };
      },
      onUpdate: (d) => events.push(`tin ${JSON.stringify(d)}`),
      onState: (c) => events.push(c ? 'đã nối' : 'mất nối'),
    });

    await link.refresh();
    expect(events).toEqual([]);

    enabled = true;
    token = 't2';
    await link.refresh();
    stateListener!({ current: 'connected' });
    messageListener!({ data: { dealId: 'abc' } });
    expect(link.connected()).toBe(true);

    token = null;
    await link.refresh();
    expect(closed).toBe(1);
    expect(link.connected()).toBe(false);
    expect(events).toEqual(['vé x', 'nghe user:7', 'đã nối', 'tin {"dealId":"abc"}', 'mất nối']);
  });
});

describe('bảng giá thu gọn', () => {
  it('tóm tắt mặt hàng, ghim mặt hàng theo dõi, ngày tương đối', async () => {
    const { summarizeProduct, pinFollowed, relativeDay } = await import('./format');
    const row = (min: number, max: number, change: number | null, date: string, source: string) => ({ price_min: min, price_max: max, change, date, sources: [source] }) as never;
    const s = summarizeProduct([row(91100, 92000, -1100, '2026-10-17', 'A'), row(91800, 91800, -1500, '2026-10-17', 'A'), row(90000, 90000, 0, '2026-10-16', 'B')]);
    expect([s.min, s.max, s.up, s.down, s.flat, s.change, s.date]).toEqual([90000, 92000, 0, 2, 1, -1100, '2026-10-17']);
    expect(s.sources).toEqual(['A', 'B']);
    expect(summarizeProduct([row(1, 1, null, '2026-10-17', 'A')]).change).toBeNull();
    const groups = ['ca-phe', 'tieu', 'lua'].map((code) => ({ product: { code } }));
    expect(pinFollowed(groups, ['lua', 'tieu']).map((g) => g.product.code)).toEqual(['lua', 'tieu', 'ca-phe']);
    expect(relativeDay('2026-10-17', '2026-10-17')).toBe('Hôm nay');
    expect(relativeDay('2026-10-16', '2026-10-17')).toBe('Hôm qua');
    expect(relativeDay('2026-10-01', '2026-10-17')).toBe('01/10/2026');
  });
});
