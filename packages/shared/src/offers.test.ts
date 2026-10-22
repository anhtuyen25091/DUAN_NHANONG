import { describe, expect, it } from 'vitest';
import { formatQuantity, offerValue } from './offers';

describe('offers', () => {
  it('hiện số lượng theo tấn khi từ 1.000 kg', () => {
    expect(formatQuantity(3000)).toBe('3 tấn');
    expect(formatQuantity(2550)).toBe('2,6 tấn');
    expect(formatQuantity(850)).toBe('850 kg');
  });

  it('ước tính tiền cả lô', () => {
    expect(offerValue({ quantity_kg: 3000 }, 93500)).toBe(280_500_000);
  });
});
