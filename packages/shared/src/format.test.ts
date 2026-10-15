import { describe, expect, it } from 'vitest';
import type { PriceRow } from './api';
import { directionsUrl, foldVietnamese, formatChange, formatDate, formatDateLong, formatDateTime, formatDistance, formatPriceRange, groupByProduct, matchesSearch, telHref, trendOf } from './format';

const row = (code: string, region: string, extra: Partial<PriceRow> = {}): PriceRow => ({
  product: { id: 1, code, name: code === 'ho-tieu' ? 'Hồ tiêu' : 'Cà phê', unit: 'kg' },
  region: { id: 1, code: region, name: region === 'dak-lak' ? 'Đắk Lắk' : 'Gia Lai', province: null },
  date: '2026-10-14',
  price_min: 139000,
  price_max: 139000,
  price_avg: 139000,
  unit: 'kg',
  change: null,
  change_percent: null,
  previous_date: null,
  sources: [],
  ...extra,
});

describe('định dạng giá', () => {
  it('khoảng giá', () => {
    expect(formatPriceRange({ price_min: 92500, price_max: 93200 })).toBe('92.500 - 93.200');
    expect(formatPriceRange({ price_min: 93200, price_max: 93200 })).toBe('93.200');
  });

  it('mức thay đổi', () => {
    expect(formatChange(1500)).toBe('+1.500');
    expect(formatChange(-700)).toBe('-700');
    expect(formatChange(0)).toBe('0');
    expect(formatChange(null)).toBe('');
    expect(trendOf(-1)).toBe('down');
    expect(trendOf(null)).toBe('none');
  });

  it('ngày', () => {
    expect(formatDate('2026-10-04')).toBe('04/10/2026');
    expect(formatDate('2026-10-04', true)).toBe('04/10');
  });
});

describe('tìm kiếm', () => {
  it('không phân biệt dấu', () => {
    expect(foldVietnamese('Đắk Lắk')).toBe('dak lak');
    expect(matchesSearch(row('ho-tieu', 'dak-lak'), 'ho tieu')).toBe(true);
    expect(matchesSearch(row('ho-tieu', 'dak-lak'), 'dak lak')).toBe(true);
    expect(matchesSearch(row('ho-tieu', 'dak-lak'), 'cà phê')).toBe(false);
    expect(matchesSearch(row('ho-tieu', 'dak-lak'), '  ')).toBe(true);
  });

  it('gom theo mặt hàng', () => {
    const groups = groupByProduct([row('ho-tieu', 'dak-lak'), row('ca-phe', 'gia-lai'), row('ho-tieu', 'gia-lai')]);
    expect(groups.map((g) => [g.product.code, g.rows.length])).toEqual([
      ['ho-tieu', 2],
      ['ca-phe', 1],
    ]);
  });
});

describe('điểm bán', () => {
  const shop = { name: 'Đại lý Hai Lúa', address: '12 QL14', province_name: 'Đắk Lắk', lat: null, lng: null };

  it('telHref bỏ khoảng trắng, dấu chấm', () => {
    expect(telHref('0262.3 456 789')).toBe('tel:02623456789');
    expect(telHref('+84 912-345-678')).toBe('tel:+84912345678');
  });

  it('directionsUrl ưu tiên tọa độ, không có thì dùng địa chỉ', () => {
    expect(directionsUrl({ ...shop, lat: 12.68, lng: 108.04 })).toBe('https://www.google.com/maps/dir/?api=1&destination=12.68%2C108.04');
    expect(directionsUrl(shop)).toContain(encodeURIComponent('Đại lý Hai Lúa, 12 QL14, Đắk Lắk'));
  });

  it('formatDistance', () => {
    expect(formatDistance(0.42)).toBe('420 m');
    expect(formatDistance(12.34)).toBe('12,3 km');
    expect(formatDistance(3)).toBe('3 km');
  });
});

describe('formatDateLong', () => {
  it('ghi thứ bằng tiếng Việt, ngày theo dạng dd/mm/yyyy', () => {
    expect(formatDateLong('2026-10-15')).toBe('Thứ Năm, 15/10/2026');
    expect(formatDateLong('2026-10-18')).toBe('Chủ Nhật, 18/10/2026');
    expect(formatDateLong('2024-02-29')).toBe('Thứ Năm, 29/02/2024');
  });
});

describe('formatDateTime', () => {
  it('ngày/tháng/năm giờ:phút theo giờ máy', () => {
    const d = new Date(2026, 9, 5, 7, 3);
    expect(formatDateTime(d.toISOString())).toBe('05/10/2026 07:03');
  });
});
