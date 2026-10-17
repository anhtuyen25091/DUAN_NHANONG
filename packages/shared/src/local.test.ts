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
});
