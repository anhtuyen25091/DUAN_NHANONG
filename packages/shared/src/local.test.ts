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
