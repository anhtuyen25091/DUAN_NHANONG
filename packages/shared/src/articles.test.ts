import { describe, expect, it } from 'vitest';
import { articleDate } from './articles';

describe('articleDate', () => {
  const now = new Date(2026, 10, 4, 10, 0);

  it('ngày gần: hôm nay / hôm qua / n ngày trước', () => {
    expect(articleDate(new Date(2026, 10, 4, 6, 0).toISOString(), now)).toBe('Hôm nay');
    expect(articleDate(new Date(2026, 10, 3, 23, 30).toISOString(), now)).toBe('Hôm qua');
    expect(articleDate(new Date(2026, 10, 1, 7, 0).toISOString(), now)).toBe('3 ngày trước');
  });

  it('từ 7 ngày trở lên: ngày/tháng/năm', () => {
    expect(articleDate(new Date(2026, 9, 28, 7, 0).toISOString(), now)).toBe('28/10/2026');
  });

  it('giờ máy chủ hơi nhanh hơn máy (ngày tương lai) vẫn là hôm nay', () => {
    expect(articleDate(new Date(2026, 10, 4, 11, 0).toISOString(), now)).toBe('Hôm nay');
  });
});
