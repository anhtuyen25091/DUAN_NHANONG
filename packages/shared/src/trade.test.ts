import { describe, expect, it } from 'vitest';
import { documentPath, formatKg, itemsText, kgInputText, parseKgText, purchaseTotals } from './trade';

describe('purchaseTotals', () => {
  it('tính kg tịnh, thành tiền như backend', () => {
    const t = purchaseTotals([
      { name: 'Cà phê nhân xô', kg: 1250.5, deduct_kg: 12.5, price: 93000 },
      { name: 'Hồ tiêu đen', kg: 320, price: 141000 },
    ]);
    expect(t.lines[0]).toMatchObject({ net_kg: 1238, amount: 115_134_000 });
    expect(t.kg).toBe(1558);
    expect(t.amount).toBe(160_254_000);
  });

  it('trừ bì không vượt số kg cân', () => {
    expect(purchaseTotals([{ name: 'Tiêu', kg: 10, deduct_kg: 15, price: 1000 }]).lines[0]).toMatchObject({ deduct_kg: 10, net_kg: 0, amount: 0 });
  });
});

describe('formatKg / itemsText', () => {
  it('định dạng kiểu Việt Nam', () => {
    expect(formatKg(1238)).toBe('1.238');
    expect(formatKg(1250.5)).toBe('1.250,5');
    expect(formatKg(0.125)).toBe('0,125');
    expect(itemsText([{ name: 'Cà phê', kg: 1238 }, { name: 'Tiêu', kg: 320.5 }])).toBe('Cà phê 1.238 kg; Tiêu 320,5 kg');
  });
});

describe('documentPath', () => {
  it('đường dẫn từng loại giấy tờ', () => {
    expect(documentPath({ type: 'purchase', id: 'abc' }, 'pdf')).toBe('/documents/purchases/abc?format=pdf');
    expect(documentPath({ type: 'deal-entry', id: 'e1' }, 'docx')).toBe('/documents/deal-entries/e1?format=docx');
    expect(documentPath({ type: 'customer', id: 'c1', from: '2026-10-01', to: '2026-10-16' }, 'pdf')).toBe('/documents/customers/c1?format=pdf&from=2026-10-01&to=2026-10-16');
    expect(documentPath({ type: 'report', from: '2026-10-01' }, 'docx')).toBe('/documents/report?format=docx&from=2026-10-01');
  });
});

describe('parseKgText', () => {
  it('đọc số kg gõ kiểu Việt Nam', () => {
    expect(parseKgText('1250,5')).toBe(1250.5);
    expect(parseKgText('1.250,5')).toBe(1250.5);
    expect(parseKgText('1250.5')).toBe(1250.5);
    expect(parseKgText('')).toBe(0);
    expect(kgInputText(1250.5)).toBe('1250,5');
    expect(kgInputText(0)).toBe('');
  });
});
