import { describe, expect, it } from 'vitest';
import { priceWarnings, type BuyPriceLimit } from './business';

const limits: BuyPriceLimit[] = [{ product_code: 'ca-phe-robusta', name: 'Cà phê nhân xô', unit: 'kg', max_price: 93000, date: '2026-10-22', set_by: 'Anh Hai' }];

describe('priceWarnings', () => {
  it('chỉ báo dòng đã chọn mặt hàng có giá chốt và đơn giá cao hơn giá chốt', () => {
    const result = priceWarnings(
      [
        { product_code: 'ca-phe-robusta', name: 'Cà phê', price: 93000 },
        { product_code: 'ca-phe-robusta', name: 'Cà phê loại 1', price: 95000 },
        { product_code: null, name: 'Cà phê tự gõ', price: 99000 },
        { product_code: 'ho-tieu', name: 'Tiêu', price: 200000 },
      ],
      limits,
    );
    expect(result).toEqual([null, { product_code: 'ca-phe-robusta', name: 'Cà phê loại 1', price: 95000, max_price: 93000 }, null, null]);
  });
});
