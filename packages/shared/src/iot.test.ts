import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './api';
import { createIotApi, describeRule, describeSchedule, monthsLabel, formatDecimal, formatIotValue, normalizeDevEui, parseDecimalInput, parseDeviceFile, pointValue, rainOfDay, thresholdLabel, timeAgo, weatherDayLabel } from './iot';

function fakeFetch(status: number, body: unknown) {
  return vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(status === 204 ? null : JSON.stringify(body), { status }));
}

const SIG = 'a'.repeat(64);

describe('createIotApi', () => {
  it('gửi token và ghép query', async () => {
    const fetch = fakeFetch(200, { metric: {}, interval: 'hour', data: [] });
    const api = createIotApi({ baseUrl: 'http://iot:8001/', getToken: () => 'tok', fetch });

    await api.readings(5, { metric: 'water_ph', interval: 'hour', from: '' });

    expect(fetch.mock.calls[0][0]).toBe('http://iot:8001/api/v1/devices/5/readings?metric=water_ph&interval=hour');
    expect((fetch.mock.calls[0][1]!.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('không có token thì không gửi Authorization', async () => {
    const fetch = fakeFetch(200, { accepted: 2, duplicates: 0, rejected: [] });
    const api = createIotApi({ baseUrl: 'http://iot', getToken: () => null, fetch });

    await api.uploadDeviceFile(`#nhanong uid=NDABC sig=${SIG}\n1,soil_ph,6`);

    const init = fetch.mock.calls[0][1]!;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(JSON.parse(init.body as string).content).toContain('NDABC');
  });

  it('lỗi mạng và lỗi máy chủ thành ApiError', async () => {
    const offline = createIotApi({ baseUrl: 'http://iot', getToken: () => null, fetch: vi.fn(async () => Promise.reject(new TypeError('x'))) });
    expect(await offline.farms().catch((e) => e.status)).toBe(0);

    const forbidden = createIotApi({ baseUrl: 'http://iot', getToken: () => null, fetch: fakeFetch(403, { message: 'Chữ ký file không hợp lệ' }) });
    const error = await forbidden.uploadDeviceFile('x').catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toBe('Chữ ký file không hợp lệ');
  });
});

describe('parseDeviceFile', () => {
  it('đọc mã thiết bị và đếm số dòng', () => {
    expect(parseDeviceFile(`#nhanong uid=ND7K3M9QXA sig=${SIG}\r\n1730170000,soil_ph,6.4\r\n1730170000,salinity,3.1\r\n`)).toEqual({ uid: 'ND7K3M9QXA', rows: 2 });
    expect(parseDeviceFile(`#nhanong uid=ND7K3M9QXA sig=${SIG}\n`)).toEqual({ uid: 'ND7K3M9QXA', rows: 0 });
  });

  it('không phải file thiết bị', () => {
    expect(parseDeviceFile('<html>Trang đăng nhập WiFi</html>')).toBeNull();
    expect(parseDeviceFile('#nhanong uid=ND1 sig=123\n')).toBeNull();
  });
});

describe('định dạng', () => {
  it('giá trị và ngưỡng', () => {
    expect(formatIotValue(4.6, '‰')).toBe('4,6 ‰');
    expect(formatIotValue(6.25, null)).toBe('6,25');
    expect(formatDecimal(12500.456)).toBe('12.500,46');
    expect(formatDecimal(-180)).toBe('-180');
    expect(thresholdLabel(7.5, 8.5)).toBe('Ngưỡng 7,5 – 8,5');
    expect(thresholdLabel(null, 4)).toBe('Ngưỡng ≤ 4');
    expect(thresholdLabel(null, null)).toBeNull();
  });

  it('thời gian trước', () => {
    const now = Date.parse('2026-10-30T10:00:00Z');
    expect(timeAgo('2026-10-30T09:59:30Z', now)).toBe('vừa xong');
    expect(timeAgo('2026-10-30T09:45:00Z', now)).toBe('15 phút trước');
    expect(timeAgo('2026-10-30T07:00:00Z', now)).toBe('3 giờ trước');
    expect(timeAgo('2026-10-28T10:00:00Z', now)).toBe('2 ngày trước');
  });

  it('giá trị điểm biểu đồ', () => {
    expect(pointValue({ t: 'x', value: 3 })).toBe(3);
    expect(pointValue({ t: 'x', min: 1, max: 5, avg: 2.5, count: 4 })).toBe(2.5);
  });
});

describe('ô nhập', () => {
  it('số kiểu Việt Nam', () => {
    expect(parseDecimalInput('7,5')).toBe(7.5);
    expect(parseDecimalInput('7.5')).toBe(7.5);
    expect(parseDecimalInput('1.200,5')).toBe(1200.5);
    expect(parseDecimalInput(' -2 ')).toBe(-2);
    expect(parseDecimalInput('')).toBeNull();
    expect(parseDecimalInput('abc')).toBeNaN();
  });

  it('DevEUI', () => {
    expect(normalizeDevEui('A8:40:41:00:01:81:C2:7A')).toBe('a84041000181c27a');
    expect(normalizeDevEui('24E1-2412 6B31 6403')).toBe('24e124126b316403');
  });

  it('tên ngày dự báo', () => {
    expect(weatherDayLabel('2026-10-31', 0)).toBe('Hôm nay');
    expect(weatherDayLabel('2026-11-01', 1)).toBe('Ngày mai');
    expect(weatherDayLabel('2026-11-02', 2)).toBe('Th 2 2/11');
  });
});

describe('lượng mưa', () => {
  it('ưu tiên máy đo mưa', () => {
    expect(rainOfDay({ date: 'x', rain_mm: 3.2, gauge_mm: 4.1 })).toBe(4.1);
    expect(rainOfDay({ date: 'x', rain_mm: 3.2, gauge_mm: null })).toBe(3.2);
    expect(rainOfDay({ date: 'x', rain_mm: null, gauge_mm: null })).toBeNull();
  });
});

describe('luật tự động', () => {
  it('mô tả dễ đọc', () => {
    const rule = {
      id: 1, plot_id: 1, metric: { code: 'water_do', name: 'Oxy hòa tan (DO)', unit: 'mg/L', group: 'water', decimals: 2 },
      actuator: { id: 1, name: 'Quạt oxy 1' }, operator: 'below' as const, value: 4, off_value: 5, minutes: 90, cooldown_minutes: 30, enabled: true, last_triggered_at: null,
    };
    expect(describeRule(rule)).toBe('Khi Oxy hòa tan (DO) thấp hơn 4 mg/L → bật Quạt oxy 1 90 phút, tắt khi ≥ 5');
    expect(describeRule({ ...rule, operator: 'above', value: 35.5, off_value: null, metric: { ...rule.metric, name: 'Nhiệt độ', unit: '°C' } })).toBe('Khi Nhiệt độ cao hơn 35,5 °C → bật Quạt oxy 1 90 phút');
  });
});

describe('lịch tưới', () => {
  it('tên các tháng', () => {
    expect(monthsLabel([12, 1, 2, 3, 4])).toBe('tháng 12 → 4');
    expect(monthsLabel([2, 3, 4])).toBe('tháng 2 → 4');
    expect(monthsLabel([3, 5])).toBe('tháng 3, 5');
    expect(monthsLabel(null)).toBe('cả năm');
    expect(monthsLabel([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toBe('cả năm');
  });

  it('mô tả lịch', () => {
    expect(describeSchedule({ start_time: '05:30', minutes: 40, every_days: 20, months: [12, 1, 2, 3, 4], skip_rain_mm: 10 })).toBe(
      '05:30 · 40 phút · mỗi 20 ngày · tháng 12 → 4 · bỏ lượt nếu đã mưa ≥ 10 mm',
    );
    expect(describeSchedule({ start_time: '17:00', minutes: 15, every_days: 1, months: null, skip_rain_mm: null })).toBe('17:00 · 15 phút · mỗi ngày · cả năm');
  });
});
