import { describe, expect, it } from 'vitest';
import { formatVnd, parseVnd, readVnd } from './money';

describe('formatVnd', () => {
  it('chèn dấu chấm hàng nghìn', () => {
    expect(formatVnd(1500000)).toBe('1.500.000 đ');
    expect(formatVnd(0)).toBe('0 đ');
    expect(formatVnd(-350000)).toBe('-350.000 đ');
  });
});

describe('readVnd', () => {
  it('đọc theo tỷ / triệu / nghìn', () => {
    expect(readVnd(1500000)).toBe('1 triệu 500 nghìn đồng');
    expect(readVnd(350000)).toBe('350 nghìn đồng');
    expect(readVnd(2030000000)).toBe('2 tỷ 30 triệu đồng');
    expect(readVnd(1000500)).toBe('1 triệu 500 đồng');
    expect(readVnd(0)).toBe('0 đồng');
  });
});

describe('parseVnd', () => {
  it('bỏ ký tự không phải số', () => {
    expect(parseVnd('1.500.000 đ')).toBe(1500000);
    expect(parseVnd('')).toBe(0);
  });
});
