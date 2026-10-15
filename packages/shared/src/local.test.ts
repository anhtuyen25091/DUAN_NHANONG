import { describe, expect, it } from 'vitest';
import { compareToReference, describeLocation, nearestProvince, provinceLocation } from './local';

describe('khu vực của tôi', () => {
  it('trung tâm tỉnh khi không có GPS; đoán tỉnh từ tọa độ', () => {
    expect(provinceLocation('dak-lak', 20, 'Đắk Lắk')).toMatchObject({ lat: 12.6667, lng: 108.05, radius: 20, gps: false });
    expect(provinceLocation('khong-co')).toBeNull();
    expect(nearestProvince(12.7, 108.1)).toBe('dak-lak');
    expect(nearestProvince(10.03, 105.78)).toBe('can-tho');
  });

  it('mô tả khu vực', () => {
    expect(describeLocation({ province: 'dak-lak', province_name: 'Đắk Lắk', lat: 0, lng: 0, label: 'Xã Hòa Thuận', radius: 30 })).toBe('Xã Hòa Thuận, Đắk Lắk · 30 km');
    expect(describeLocation({ province: 'dak-lak', province_name: 'Đắk Lắk', lat: 0, lng: 0, label: null, radius: 20 })).toBe('Trung tâm Đắk Lắk · 20 km');
  });
});

describe('so với giá chung', () => {
  it('nông sản: cao hơn là tốt cho người bán; phân thuốc: thấp hơn là tốt cho người mua', () => {
    expect(compareToReference(95000, 93000, 'nong_san')).toEqual({ diff: 2000, percent: 2, good: true });
    expect(compareToReference(500000, 520000, 'phan_bon')).toMatchObject({ diff: -20000, good: true });
    expect(compareToReference(540000, 520000, 'phan_bon')).toMatchObject({ good: false });
    expect(compareToReference(1, null, 'nong_san')).toBeNull();
  });
});
